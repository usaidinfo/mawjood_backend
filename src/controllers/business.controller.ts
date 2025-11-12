import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest, BusinessDTO } from '../types';
import { uploadToCloudinary } from '../config/cloudinary';

type LocationType = 'city' | 'region' | 'country';

interface LocationLevel {
  type: LocationType;
  id: string;
  name: string;
  cityIds: string[];
}

interface LocationHierarchyResult {
  resolvedType: LocationType;
  resolvedName: string;
  requestedId: string;
  levels: LocationLevel[];
}

const uniqueCityIds = (ids: (string | null | undefined)[]): string[] =>
  Array.from(new Set(ids.filter(Boolean) as string[]));

const normaliseLocationType = (value?: string): LocationType | undefined => {
  if (value === 'city' || value === 'region' || value === 'country') {
    return value;
  }
  return undefined;
};

const prismaClient = prisma as any;

const fetchRegionCityIds = async (regionId: string): Promise<string[]> => {
  const cities = await prismaClient.city.findMany({
    where: { regionId },
    select: { id: true },
  });
  return uniqueCityIds(cities.map((c) => c.id));
};

const resolveLocationHierarchy = async (
  locationId: string,
  locationType?: string
): Promise<LocationHierarchyResult | null> => {
  const requestedType = normaliseLocationType(locationType);

  if (!requestedType || requestedType === 'city') {
    const city = await prismaClient.city.findUnique({
      where: { id: locationId },
      select: {
        id: true,
        name: true,
        regionId: true,
      },
    });

    if (city) {
      const levels: LocationLevel[] = [
        {
          type: 'city',
          id: city.id,
          name: city.name,
          cityIds: [city.id],
        },
      ];

      if (city.regionId) {
        const region = await prismaClient.region.findUnique({
          where: { id: city.regionId },
          select: {
            id: true,
            name: true,
          },
        });

        if (region) {
          const regionCityIds = await fetchRegionCityIds(region.id);
          if (regionCityIds.length > 0) {
            levels.push({
              type: 'region',
              id: region.id,
              name: region.name,
              cityIds: regionCityIds,
            });
          }
        }
      }

      return {
        resolvedType: 'city',
        resolvedName: city.name,
        requestedId: city.id,
        levels,
      };
    }
  }

  if (!requestedType || requestedType === 'region') {
    const region = await prismaClient.region.findUnique({
      where: { id: locationId },
      select: {
        id: true,
        name: true,
        countryId: true,
      },
    });

      if (region) {
        const levels: LocationLevel[] = [];
        const regionCityIds = await fetchRegionCityIds(region.id);
        if (regionCityIds.length > 0) {
          levels.push({
            type: 'region',
            id: region.id,
            name: region.name,
            cityIds: regionCityIds,
          });
        }

        return {
          resolvedType: 'region',
          resolvedName: region.name,
          requestedId: region.id,
          levels,
        };
      }
  }

  return null;
};

export const getAllBusinesses = async (req: Request, res: Response) => {
  try {
    const requestStart = Date.now();
    const {
      page = '1',
      limit = '10',
      search,
      categoryId,
      categoryIds,
      cityId,
      locationId,
      locationType,
      status,
      isVerified,
      sortBy = 'newest',
      rating,
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const baseWhere: any = {
      status: 'APPROVED',
    };

    if (search) {
      baseWhere.OR = [
        { name: { contains: search as string } },
        { description: { contains: search as string } },
      ];
    }

    if (categoryIds) {
      const idsArray =
        typeof categoryIds === 'string' ? categoryIds.split(',') : categoryIds;
      baseWhere.categoryId = { in: idsArray };
    } else if (categoryId) {
      baseWhere.categoryId = categoryId;
    }

    if (status) {
      baseWhere.status = status;
    }

    if (isVerified !== undefined) {
      baseWhere.isVerified = isVerified === 'true';
    }

    const minRating =
      typeof rating === 'string' && rating.trim().length
        ? parseFloat(rating as string)
        : undefined;

    if (minRating !== undefined && !Number.isNaN(minRating)) {
      baseWhere.averageRating = {
        gte: minRating,
      };
    }

    const resolvedLocationId =
      typeof locationId === 'string' && locationId.trim().length > 0
        ? locationId
        : typeof cityId === 'string' && cityId.trim().length > 0
        ? cityId
        : null;

    const resolvedLocationType =
      typeof locationType === 'string' ? locationType : undefined;

    const includeConfig: any = {
      category: true,
      city: {
        include: { region: true },
      },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    };

    const buildWhereWithCityIds = (cityIds?: string[]) => {
      const whereClause = { ...baseWhere };
      if (cityIds && cityIds.length > 0) {
        whereClause.cityId =
          cityIds.length === 1 ? cityIds[0] : { in: Array.from(new Set(cityIds)) };
      }
      return whereClause;
    };

    let locationHierarchy: LocationHierarchyResult | null = null;
    if (resolvedLocationId) {
      locationHierarchy = await resolveLocationHierarchy(
        resolvedLocationId,
        resolvedLocationType
      );
    }

    let appliedLocationLevel: LocationLevel | null = null;
    let whereClause = buildWhereWithCityIds();

    if (locationHierarchy && locationHierarchy.levels.length > 0) {
      for (const level of locationHierarchy.levels) {
        if (!level.cityIds.length) {
          continue;
        }
        const candidateWhere = buildWhereWithCityIds(level.cityIds);
        const count = await prisma.business.count({ where: candidateWhere });
        if (count > 0) {
          appliedLocationLevel = level;
          whereClause = candidateWhere;
          break;
        }
      }
    }

    const sortOption = typeof sortBy === 'string' ? sortBy : 'newest';

    const buildOrderBy = (option: string) => {
      switch (option) {
        case 'rating_high':
          return [
            { averageRating: 'desc' as const },
            { createdAt: 'desc' as const },
          ];
        case 'rating_low':
          return [
            { averageRating: 'asc' as const },
            { createdAt: 'desc' as const },
          ];
        case 'oldest':
          return [{ createdAt: 'asc' as const }];
        case 'verified':
          return [
            { isVerified: 'desc' as const },
            { createdAt: 'desc' as const },
          ];
        case 'not_verified':
          return [
            { isVerified: 'asc' as const },
            { createdAt: 'desc' as const },
          ];
        case 'popular':
          return [
            { averageRating: 'desc' as const },
            { totalReviews: 'desc' as const },
            { createdAt: 'desc' as const },
          ];
        case 'name_asc':
          return [{ name: 'asc' as const }];
        case 'name_desc':
          return [{ name: 'desc' as const }];
        default:
          return [{ createdAt: 'desc' as const }];
      }
    };

    const total = await prisma.business.count({ where: whereClause });

    const rawBusinesses = await prisma.business.findMany({
      where: whereClause,
      include: includeConfig,
      orderBy: buildOrderBy(sortOption),
      skip,
      take: parseInt(limit as string),
    });

    const resultBusinesses = rawBusinesses;

    const locationContext = locationHierarchy
      ? {
          requested: {
            id: locationHierarchy.requestedId,
            type: locationHierarchy.resolvedType,
            name: locationHierarchy.resolvedName,
          },
          applied: appliedLocationLevel
            ? {
                id: appliedLocationLevel.id,
                type: appliedLocationLevel.type,
                name: appliedLocationLevel.name,
              }
            : null,
          fallbackApplied:
            !!appliedLocationLevel &&
            appliedLocationLevel.type !== locationHierarchy.resolvedType,
        }
      : undefined;

    const responsePayload: any = {
      businesses: resultBusinesses,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    };

    if (locationContext) {
      responsePayload.locationContext = locationContext;
    }

    const requestDuration = Date.now() - requestStart;
    if (requestDuration > 1000) {
      console.warn(
        `[PERF] getAllBusinesses took ${requestDuration}ms`,
        JSON.stringify({
          search,
          categoryId,
          categoryIds,
          locationId: resolvedLocationId,
          locationType: resolvedLocationType,
          sortBy,
          rating,
          resultCount: responsePayload.businesses.length,
          total,
        })
      );
    }

    return sendSuccess(res, 200, 'Businesses fetched successfully', responsePayload);
  } catch (error) {
    console.error('Get businesses error:', error);
    return sendError(res, 500, 'Failed to fetch businesses', error);
  }
};

// Get all businesses for admin (all statuses)
export const getAllBusinessesAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '10', status, search } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};

    // Add status filter
    if (status) {
      where.status = status;
    }

    // Add search functionality
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const searchTerm = search.trim();
      const searchConditions: any[] = [
        { name: { contains: searchTerm } },
        { description: { contains: searchTerm } },
        { 
          user: {
            OR: [
              { firstName: { contains: searchTerm } },
              { lastName: { contains: searchTerm } },
              { email: { contains: searchTerm } },
            ],
          },
        },
        { 
          city: {
            name: { contains: searchTerm },
          },
        },
      ];

      // If we already have a status filter, combine with AND
      if (where.status) {
        where.AND = [
          { status: where.status },
          { OR: searchConditions },
        ];
        delete where.status;
      } else {
        where.OR = searchConditions;
      }
    }

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        include: {
          category: true,
          city: {
            include: { region: true },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.business.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Businesses fetched successfully', {
      businesses,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get businesses error:', error);
    return sendError(res, 500, 'Failed to fetch businesses', error);
  }
};

// Get single business by ID
export const getBusinessById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const business = await prisma.business.findUnique({
      where: { id },
      include: {
        category: true,
        city: {
          include: { region: true },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        services: true,
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    return sendSuccess(res, 200, 'Business fetched successfully', business);
  } catch (error) {
    console.error('Get business error:', error);
    return sendError(res, 500, 'Failed to fetch business', error);
  }
};

// Get business by slug
export const getBusinessBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const business = await prisma.business.findUnique({
      where: { slug },
      include: {
        category: true,
        city: {
          include: { region: true },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        services: true,
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    return sendSuccess(res, 200, 'Business fetched successfully', business);
  } catch (error) {
    console.error('Get business error:', error);
    return sendError(res, 500, 'Failed to fetch business', error);
  }
};

// Create business (Business Owner/Admin)
export const createBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const {
      name,
      slug,
      description,
      email,
      phone,
      whatsapp,
      website,
      address,
      latitude,
      longitude,
      categoryId,
      cityId,
      crNumber,
      workingHours,
      metaTitle,
      metaDescription,
      keywords,
    } = req.body;

    if (!name || !slug || !email || !phone || !address || !categoryId || !cityId) {
      return sendError(res, 400, 'Required fields are missing');
    }

    const existingBusiness = await prisma.business.findUnique({
      where: { slug },
    });

    if (existingBusiness) {
      return sendError(res, 409, 'Business with this slug already exists');
    }

    // Handle file uploads
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    let logo = null;
    let coverImage = null;
    let images: string[] = [];

    if (files) {
      if (files.logo && files.logo[0]) {
        logo = await uploadToCloudinary(files.logo[0], 'businesses/logos');
      }

      if (files.coverImage && files.coverImage[0]) {
        coverImage = await uploadToCloudinary(files.coverImage[0], 'businesses/covers');
      }

      if (files.images && files.images.length > 0) {
        const imageUploads = await Promise.all(
          files.images.map(async (file) => {
            const url = await uploadToCloudinary(file, 'businesses/gallery');
            return url;
          })
        );
        images = imageUploads;
      }
    }

    // Parse working hours properly
    let parsedWorkingHours = null;
    if (workingHours) {
      try {
        parsedWorkingHours = typeof workingHours === 'string'
          ? JSON.parse(workingHours)
          : workingHours;
      } catch (e) {
        console.error('Working hours parse error:', e);
      }
    }

    // Parse keywords properly
    let parsedKeywords = null;
    if (keywords) {
      try {
        parsedKeywords = typeof keywords === 'string'
          ? JSON.parse(keywords)
          : keywords;
      } catch (e) {
        console.error('Keywords parse error:', e);
      }
    }

    const business = await prisma.business.create({
      data: {
        name,
        slug,
        description,
        email,
        phone,
        whatsapp,
        website,
        address,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        categoryId,
        cityId,
        userId: userId!,
        crNumber,
        workingHours: parsedWorkingHours,
        metaTitle,
        metaDescription,
        keywords: parsedKeywords,
        logo,
        coverImage,
        images: images.length > 0 ? images : null,
        status: 'PENDING',
      },
      include: {
        category: true,
        city: true,
      },
    });

    return sendSuccess(res, 201, 'Business created successfully', business);
  } catch (error) {
    console.error('Create business error:', error);

    // Cleanup uploaded files on error

    return sendError(res, 500, 'Failed to create business', error);
  }
};

// Update business (Owner/Admin)
export const updateBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const existingBusiness = await prisma.business.findUnique({
      where: { id },
    });

    if (!existingBusiness) {
      return sendError(res, 404, 'Business not found');
    }

    if (existingBusiness.userId !== userId && userRole !== 'ADMIN') {
      return sendError(res, 403, 'You are not authorized to update this business');
    }

    const {
      name,
      slug,
      description,
      email,
      phone,
      whatsapp,
      website,
      address,
      latitude,
      longitude,
      categoryId,
      cityId,
      crNumber,
      workingHours,
      metaTitle,
      metaDescription,
      keywords,
    } = req.body;

    // Handle file uploads
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const updateData: any = {
      name,
      slug,
      description,
      email,
      phone,
      whatsapp,
      website,
      address,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      categoryId,
      cityId,
      crNumber,
      workingHours: workingHours ? JSON.parse(workingHours) : undefined,
      metaTitle,
      metaDescription,
      keywords: keywords ? JSON.parse(keywords) : undefined,
    };

    if (files) {
      if (files.logo && files.logo[0]) {
        updateData.logo = await uploadToCloudinary(files.logo[0], 'businesses/logos');
      }

      if (files.coverImage && files.coverImage[0]) {
        updateData.coverImage = await uploadToCloudinary(files.coverImage[0], 'businesses/covers');
      }

      if (files && files.images && files.images.length > 0) {
        const imageUploads = await Promise.all(
          files.images.map(async (file) => {
            const url = await uploadToCloudinary(file, 'businesses/gallery');
            return url;
          })
        );

        // Get existing images with proper type assertion
        const existingImages = (existingBusiness.images as string[]) || [];

        updateData.images = [...existingImages, ...imageUploads];
      }
    }

    const business = await prisma.business.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        city: true,
      },
    });

    return sendSuccess(res, 200, 'Business updated successfully', business);
  } catch (error) {
    console.error('Update business error:', error);



    return sendError(res, 500, 'Failed to update business', error);
  }
};

// Delete business (Owner/Admin)
export const deleteBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const existingBusiness = await prisma.business.findUnique({
      where: { id },
    });

    if (!existingBusiness) {
      return sendError(res, 404, 'Business not found');
    }

    if (existingBusiness.userId !== userId && userRole !== 'ADMIN') {
      return sendError(res, 403, 'You are not authorized to delete this business');
    }

    await prisma.business.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'Business deleted successfully');
  } catch (error) {
    console.error('Delete business error:', error);
    return sendError(res, 500, 'Failed to delete business', error);
  }
};

// Get businesses by current user
export const getMyBusinesses = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const businesses = await prisma.business.findMany({
      where: { userId },
      include: {
        category: true,
        city: true,
        reviews: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Your businesses fetched successfully', businesses);
  } catch (error) {
    console.error('Get my businesses error:', error);
    return sendError(res, 500, 'Failed to fetch your businesses', error);
  }
};

// Approve business (Admin only)
export const approveBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const business = await prisma.business.update({
      where: { id },
      data: {
        status: 'APPROVED',
        isVerified: true,
      },
    });

    // Create notification for business owner
    await prisma.notification.create({
      data: {
        userId: business.userId,
        type: 'BUSINESS_APPROVED',
        title: 'Business Approved! 🎉',
        message: `Your business "${business.name}" has been approved and is now live!`,
        link: `/dashboard/my-listings`,
      },
    });

    return sendSuccess(res, 200, 'Business approved successfully', business);
  } catch (error) {
    console.error('Approve business error:', error);
    return sendError(res, 500, 'Failed to approve business', error);
  }
};

// Reject business (Admin only)
export const rejectBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body; // Optional rejection reason

    const business = await prisma.business.update({
      where: { id },
      data: { status: 'REJECTED' },
    });

    // Create notification for business owner
    await prisma.notification.create({
      data: {
        userId: business.userId,
        type: 'BUSINESS_REJECTED',
        title: 'Business Rejected',
        message: `Your business "${business.name}" has been rejected. ${reason ? `Reason: ${reason}` : 'Please contact support for more details.'}`,
        link: `/dashboard/my-listings`,
      },
    });

    return sendSuccess(res, 200, 'Business rejected successfully', business);
  } catch (error) {
    console.error('Reject business error:', error);
    return sendError(res, 500, 'Failed to reject business', error);
  }
};

// Add service to business
export const addService = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const userId = req.user?.userId;
    const { name, description, price, duration } = req.body;

    if (!name || !price) {
      return sendError(res, 400, 'Name and price are required');
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    if (business.userId !== userId && req.user?.role !== 'ADMIN') {
      return sendError(res, 403, 'You are not authorized to add services to this business');
    }

    const service = await prisma.service.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        duration: duration ? parseInt(duration as string, 10) : null,
        businessId,
      },
    });

    return sendSuccess(res, 201, 'Service added successfully', service);
  } catch (error) {
    console.error('Add service error:', error);
    return sendError(res, 500, 'Failed to add service', error);
  }
};

// Get services by business
export const getBusinessServices = async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;

    const services = await prisma.service.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Services fetched successfully', services);
  } catch (error) {
    console.error('Get services error:', error);
    return sendError(res, 500, 'Failed to fetch services', error);
  }
};

// Delete service
export const deleteService = async (req: AuthRequest, res: Response) => {
  try {
    const { serviceId } = req.params;
    const userId = req.user?.userId;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { business: true },
    });

    if (!service) {
      return sendError(res, 404, 'Service not found');
    }

    if (service.business.userId !== userId && req.user?.role !== 'ADMIN') {
      return sendError(res, 403, 'You are not authorized to delete this service');
    }

    await prisma.service.delete({
      where: { id: serviceId },
    });

    return sendSuccess(res, 200, 'Service deleted successfully');
  } catch (error) {
    console.error('Delete service error:', error);
    return sendError(res, 500, 'Failed to delete service', error);
  }
};

// Unified search endpoint for both businesses and categories
// Unified search endpoint for both businesses and categories
export const unifiedSearch = async (req: Request, res: Response) => {
  try {
    const { query, cityId, limit = '10' } = req.query;

    if (!query || (query as string).length < 2) {
      return sendError(res, 400, 'Search query must be at least 2 characters');
    }

    const searchTerm = query as string;
    const searchLimit = parseInt(limit as string);

    // Search categories (remove mode: 'insensitive' for MySQL)
    const categories = await prisma.category.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm } },
          { description: { contains: searchTerm } },
        ],
      },
      take: searchLimit,
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        description: true,
      },
    });

    // Search businesses (remove mode: 'insensitive' and fix select/include)
    const businessWhere: any = {
      status: 'APPROVED',
      OR: [
        { name: { contains: searchTerm } },
        { description: { contains: searchTerm } },
      ],
    };

    if (cityId) {
      businessWhere.cityId = cityId;
    }

    const businesses = await prisma.business.findMany({
      where: businessWhere,
      take: searchLimit,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logo: true,
        averageRating: true,
        totalReviews: true,
        isVerified: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        city: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return sendSuccess(res, 200, 'Search results fetched successfully', {
      categories: categories.map(cat => ({ ...cat, type: 'category' })),
      businesses: businesses.map(bus => ({ ...bus, type: 'business' })),
      query: searchTerm,
    });
  } catch (error) {
    console.error('Unified search error:', error);
    return sendError(res, 500, 'Failed to perform search', error);
  }
};

// Add this export at the end of the file, before the last export

// Get featured/trending businesses
export const getFeaturedBusinesses = async (req: Request, res: Response) => {
  try {
    const { limit = '8', cityId, locationId, locationType } = req.query;

    const baseWhere: any = {
      status: 'APPROVED',
      isVerified: true,
    };

    const resolvedLocationId =
      typeof locationId === 'string' && locationId.trim().length > 0
        ? locationId
        : typeof cityId === 'string' && cityId.trim().length > 0
        ? cityId
        : null;

    const resolvedLocationType =
      typeof locationType === 'string' ? locationType : undefined;

    const includeConfig = {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          icon: true,
        },
      },
      city: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      },
    };

    const buildWhereWithCityIds = (cityIds?: string[]) => {
      const whereClause = { ...baseWhere };
      if (cityIds && cityIds.length > 0) {
        whereClause.cityId =
          cityIds.length === 1 ? cityIds[0] : { in: Array.from(new Set(cityIds)) };
      }
      return whereClause;
    };

    const fetchFeaturedByCityIds = async (cityIds?: string[]) =>
      prisma.business.findMany({
        where: buildWhereWithCityIds(cityIds),
        include: includeConfig,
        orderBy: [
          { averageRating: 'desc' },
          { totalReviews: 'desc' },
          { createdAt: 'desc' },
        ],
        take: parseInt(limit as string),
      });

    let locationHierarchy: LocationHierarchyResult | null = null;
    if (resolvedLocationId) {
      locationHierarchy = await resolveLocationHierarchy(
        resolvedLocationId,
        resolvedLocationType
      );
    }

    let appliedLocationLevel: LocationLevel | null = null;
    const businesses =
      locationHierarchy && locationHierarchy.levels.length > 0
        ? await (async () => {
            for (const level of locationHierarchy!.levels) {
              if (!level.cityIds.length) {
                continue;
              }
              const result = await fetchFeaturedByCityIds(level.cityIds);
              if (result.length > 0) {
                appliedLocationLevel = level;
                return result;
              }
            }
            return await fetchFeaturedByCityIds();
          })()
        : await fetchFeaturedByCityIds();

    const locationContext = locationHierarchy
      ? {
          requested: {
            id: locationHierarchy.requestedId,
            type: locationHierarchy.resolvedType,
            name: locationHierarchy.resolvedName,
          },
          applied: appliedLocationLevel
            ? {
                id: appliedLocationLevel.id,
                type: appliedLocationLevel.type,
                name: appliedLocationLevel.name,
              }
            : null,
          fallbackApplied:
            !!appliedLocationLevel &&
            appliedLocationLevel.type !== locationHierarchy.resolvedType,
        }
      : undefined;

    return sendSuccess(res, 200, 'Featured businesses fetched successfully', {
      businesses,
      ...(locationContext ? { locationContext } : {}),
    });
  } catch (error) {
    console.error('Get featured businesses error:', error);
    return sendError(res, 500, 'Failed to fetch featured businesses', error);
  }
};

export const trackBusinessView = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';

    // Check if this IP viewed in last hour
    const recentView = await prisma.businessView.findFirst({
      where: {
        businessId: id,
        ipAddress,
        viewedAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000)
        }
      }
    });

    if (!recentView) {
      await prisma.businessView.create({
        data: {
          businessId: id,
          ipAddress
        }
      });
    }

    return res.json({
      success: true,
      message: 'View tracked successfully'
    });
  } catch (error) {
    console.error('Track view error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to track view'
    });
  }
};

export const getBusinessAnalytics = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Total views
    const totalViews = await prisma.businessView.count({
      where: { businessId: id }
    });

    // Today's views
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayViews = await prisma.businessView.count({
      where: {
        businessId: id,
        viewedAt: { gte: todayStart }
      }
    });

    // Last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const last7DaysViews = await prisma.businessView.groupBy({
      by: ['viewedAt'],
      where: {
        businessId: id,
        viewedAt: { gte: sevenDaysAgo }
      },
      _count: true
    });

    // Format last 7 days data
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      const dayViews = last7DaysViews.filter(v =>
        v.viewedAt.toISOString().split('T')[0] === dateString
      );

      last7Days.push({
        date: dateString,
        count: dayViews.length
      });
    }

    // Last 30 days (similar logic)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const last30DaysViews = await prisma.businessView.groupBy({
      by: ['viewedAt'],
      where: {
        businessId: id,
        viewedAt: { gte: thirtyDaysAgo }
      },
      _count: true
    });

    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      const dayViews = last30DaysViews.filter(v =>
        v.viewedAt.toISOString().split('T')[0] === dateString
      );

      last30Days.push({
        date: dateString,
        count: dayViews.length
      });
    }

    return res.json({
      success: true,
      data: {
        totalViews,
        todayViews,
        last7Days,
        last30Days
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get analytics'
    });
  }
};

export const getMyBusinessesServices = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const businesses = await prisma.business.findMany({
      where: {
        userId,
        services: {
          some: {}  // Only businesses that have at least one service
        }
      },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        services: {
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return sendSuccess(res, 200, 'Services fetched successfully', businesses);
  } catch (error) {
    console.error('Get my businesses services error:', error);
    return sendError(res, 500, 'Failed to fetch services', error);
  }
};

// Get all reviews received on user's businesses
export const getMyBusinessesReviews = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Get user's business IDs
    const businesses = await prisma.business.findMany({
      where: { userId },
      select: { id: true }
    });

    const businessIds = businesses.map(b => b.id);

    // Get all reviews for these businesses
    const reviews = await prisma.review.findMany({
      where: {
        businessId: { in: businessIds }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        },
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return sendSuccess(res, 200, 'Reviews fetched successfully', reviews);
  } catch (error) {
    console.error('Get my businesses reviews error:', error);
    return sendError(res, 500, 'Failed to fetch reviews', error);
  }
};