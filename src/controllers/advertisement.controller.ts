import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendError, sendSuccess } from '../utils/response.util';
import { uploadToCloudinary } from '../config/cloudinary';

const prismaClient = prisma as any;

const parseBoolean = (value: any): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
};

const parseDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const buildDateRangeFilter = () => {
  const now = new Date();
  return {
    AND: [
      {
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      },
      {
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
    ],
  };
};

const validateLocationChain = async (locationId?: string | null, locationType?: string | null) => {
  if (!locationId || !locationType) {
    return { cityId: null, regionId: null, countryId: null };
  }

  switch (locationType) {
    case 'city': {
      const city = await prismaClient.city.findUnique({
        where: { id: locationId },
        select: {
          id: true,
          regionId: true,
          region: {
            select: {
              id: true,
              countryId: true,
            },
          },
        },
      });

      if (!city) return { cityId: null, regionId: null, countryId: null };
      return {
        cityId: city.id,
        regionId: city.regionId,
        countryId: city.region?.countryId ?? null,
      };
    }
    case 'region': {
      const region = await prismaClient.region.findUnique({
        where: { id: locationId },
        select: {
          id: true,
          countryId: true,
        },
      });

      if (!region) return { cityId: null, regionId: null, countryId: null };
      return {
        cityId: null,
        regionId: region.id,
        countryId: region.countryId ?? null,
      };
    }
    case 'country': {
      const country = await prismaClient.country.findUnique({
        where: { id: locationId },
        select: { id: true },
      });

      if (!country) return { cityId: null, regionId: null, countryId: null };
      return { cityId: null, regionId: null, countryId: country.id };
    }
    default:
      return { cityId: null, regionId: null, countryId: null };
  }
};

export const createAdvertisement = async (req: Request, res: Response) => {
  try {
    const {
      title,
      targetUrl,
      openInNewTab,
      adType,
      isActive,
      startsAt,
      endsAt,
      notes,
      countryId,
      regionId,
      cityId,
      categoryId,
    } = req.body;

    if (!title) {
      return sendError(res, 400, 'Title is required');
    }

    if (!req.file) {
      return sendError(res, 400, 'Advertisement image is required');
    }

    const validAdTypes = ['CATEGORY', 'TOP', 'FOOTER', 'BUSINESS_LISTING', 'BLOG_LISTING', 'HOMEPAGE'];
    if (!adType || !validAdTypes.includes(adType)) {
      return sendError(res, 400, `Ad type is required and must be one of: ${validAdTypes.join(', ')}`);
    }

    const imageUrl = await uploadToCloudinary(req.file, 'advertisements/banners');

    const advertisement = await prismaClient.advertisement.create({
      data: {
        title,
        imageUrl,
        targetUrl,
        openInNewTab: parseBoolean(openInNewTab) ?? true,
        adType,
        notes,
        isActive: parseBoolean(isActive) ?? true,
        startsAt: parseDate(startsAt),
        endsAt: parseDate(endsAt),
        countryId: countryId || null,
        regionId: regionId || null,
        cityId: cityId || null,
        categoryId: categoryId || null,
        createdById: (req as any).user?.userId ?? null,
      },
    });

    return sendSuccess(res, 201, 'Advertisement created successfully', advertisement);
  } catch (error) {
    console.error('Create advertisement error:', error);
    return sendError(res, 500, 'Failed to create advertisement', error);
  }
};

export const updateAdvertisement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prismaClient.advertisement.findUnique({ where: { id } });

    if (!existing) {
      return sendError(res, 404, 'Advertisement not found');
    }

    const {
      title,
      targetUrl,
      openInNewTab,
      adType,
      isActive,
      startsAt,
      endsAt,
      notes,
      countryId,
      regionId,
      cityId,
      categoryId,
    } = req.body;

    const updateData: any = {
      title,
      targetUrl,
      notes,
      isActive: parseBoolean(isActive),
      startsAt: parseDate(startsAt),
      endsAt: parseDate(endsAt),
      countryId: countryId !== undefined ? countryId || null : undefined,
      regionId: regionId !== undefined ? regionId || null : undefined,
      cityId: cityId !== undefined ? cityId || null : undefined,
      categoryId: categoryId !== undefined ? categoryId || null : undefined,
    };

    if (openInNewTab !== undefined) {
      updateData.openInNewTab = parseBoolean(openInNewTab);
    }

    const validAdTypes = ['CATEGORY', 'TOP', 'FOOTER', 'BUSINESS_LISTING', 'BLOG_LISTING', 'HOMEPAGE'];
    if (adType && validAdTypes.includes(adType)) {
      updateData.adType = adType;
    }

    if (req.file) {
      updateData.imageUrl = await uploadToCloudinary(req.file, 'advertisements/banners');
    }

    const advertisement = await prismaClient.advertisement.update({
      where: { id },
      data: updateData,
    });

    return sendSuccess(res, 200, 'Advertisement updated successfully', advertisement);
  } catch (error) {
    console.error('Update advertisement error:', error);
    return sendError(res, 500, 'Failed to update advertisement', error);
  }
};

export const deleteAdvertisement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prismaClient.advertisement.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 404, 'Advertisement not found');
    }

    await prismaClient.advertisement.delete({ where: { id } });
    return sendSuccess(res, 200, 'Advertisement deleted successfully');
  } catch (error) {
    console.error('Delete advertisement error:', error);
    return sendError(res, 500, 'Failed to delete advertisement', error);
  }
};

export const getAdvertisementById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const advertisement = await prismaClient.advertisement.findUnique({
      where: { id },
      include: {
        city: true,
        region: true,
        country: true,
        category: true,
      },
    });

    if (!advertisement) {
      return sendError(res, 404, 'Advertisement not found');
    }

    return sendSuccess(res, 200, 'Advertisement fetched successfully', advertisement);
  } catch (error) {
    console.error('Get advertisement error:', error);
    return sendError(res, 500, 'Failed to fetch advertisement', error);
  }
};

export const getAdvertisements = async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '10',
      categoryId,
      cityId,
      regionId,
      countryId,
      isActive,
      adType,
      search,
    } = req.query;

    const skip = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    const where: any = {};
    const andConditions: any[] = [];

    // Build filter conditions
    if (categoryId) andConditions.push({ categoryId });
    if (cityId) andConditions.push({ cityId });
    if (regionId) andConditions.push({ regionId });
    if (countryId) andConditions.push({ countryId });
    
    const validAdTypes = ['CATEGORY', 'TOP', 'FOOTER', 'BUSINESS_LISTING', 'BLOG_LISTING', 'HOMEPAGE'];
    if (adType && validAdTypes.includes(adType as string)) {
      andConditions.push({ adType });
    }

    const parsedActive = parseBoolean(isActive);
    if (parsedActive !== undefined) {
      andConditions.push({ isActive: parsedActive });
    }


    if (search && typeof search === 'string' && search.trim().length > 0) {
      const searchTerm = search.trim();
      andConditions.push({
        OR: [
          {
            title: {
              contains: searchTerm,
            },
          },
          {
            notes: {
              contains: searchTerm,
            },
          },
        ],
      });
    }

    // Combine all conditions with AND
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [advertisements, total] = await Promise.all([
      prismaClient.advertisement.findMany({
        where,
        include: {
          city: true,
          region: true,
          country: true,
          category: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string, 10),
      }),
      prismaClient.advertisement.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Advertisements fetched successfully', {
      advertisements,
      pagination: {
        total,
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        totalPages: Math.ceil(total / parseInt(limit as string, 10)),
      },
    });
  } catch (error) {
    console.error('List advertisements error:', error);
    return sendError(res, 500, 'Failed to fetch advertisements', error);
  }
};

type Candidate = {
  cityId?: string | null;
  regionId?: string | null;
  countryId?: string | null;
  categoryId?: string | null | undefined;
};

const findAdvertisementWithFallback = async (candidates: Candidate[], adType: string) => {
  for (const candidate of candidates) {
    const where: any = {
      isActive: true,
      adType,
      ...buildDateRangeFilter(),
    };

    if (candidate.cityId !== undefined) {
      where.cityId = candidate.cityId;
    }
    if (candidate.regionId !== undefined) {
      where.regionId = candidate.regionId;
    }
    if (candidate.countryId !== undefined) {
      where.countryId = candidate.countryId;
    }
    if (candidate.categoryId !== undefined) {
      where.categoryId = candidate.categoryId === null ? null : candidate.categoryId;
    }

    // Get all matching ads and return a random one
    const advertisements = await prismaClient.advertisement.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    if (advertisements.length > 0) {
      // Return a random ad from the matching ads
      const randomIndex = Math.floor(Math.random() * advertisements.length);
      return advertisements[randomIndex];
    }
  }

  return null;
};

export const getAdvertisementForDisplay = async (req: Request, res: Response) => {
  try {
    const { locationId, locationType, categoryId, adType } = req.query;

    const validAdTypes = ['CATEGORY', 'TOP', 'FOOTER', 'BUSINESS_LISTING', 'BLOG_LISTING', 'HOMEPAGE'];
    if (!adType || !validAdTypes.includes(adType as string)) {
      return sendError(res, 400, `Ad type is required and must be one of: ${validAdTypes.join(', ')}`);
    }

    const { cityId, regionId, countryId } = await validateLocationChain(
      typeof locationId === 'string' ? locationId : undefined,
      typeof locationType === 'string' ? locationType : undefined,
    );

    const candidates: Candidate[] = [];

    if (cityId) {
      if (categoryId) {
        candidates.push({ cityId, categoryId: categoryId as string });
      }
      candidates.push({ cityId, categoryId: null });
    }

    if (regionId) {
      if (categoryId) {
        candidates.push({ regionId, categoryId: categoryId as string });
      }
      candidates.push({ regionId, categoryId: null });
    }

    if (countryId) {
      if (categoryId) {
        candidates.push({ countryId, categoryId: categoryId as string });
      }
      candidates.push({ countryId, categoryId: null });
    }

    // Add global fallback (no location specified)
    if (categoryId) {
      candidates.push({ cityId: null, regionId: null, countryId: null, categoryId: categoryId as string });
    }
    candidates.push({ cityId: null, regionId: null, countryId: null, categoryId: null });

    const advertisement = await findAdvertisementWithFallback(candidates, adType as string);

    if (!advertisement) {
      return sendSuccess(res, 200, 'No advertisement found for the provided context', null);
    }

    return sendSuccess(res, 200, 'Advertisement fetched successfully', advertisement);
  } catch (error) {
    console.error('Get advertisement for display error:', error);
    return sendError(res, 500, 'Failed to fetch advertisement', error);
  }
};
