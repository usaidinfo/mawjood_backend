import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest, BusinessDTO } from '../types';
import { uploadToCloudinary } from '../config/cloudinary';
import fs from 'fs';

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const getAllBusinesses = async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '10',
      search,
      categoryId,
      cityId,
      status,
      isVerified,
      latitude,
      longitude,
      radius = '10', // km
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {
      status: 'APPROVED',
    };

    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { description: { contains: search as string } },
      ];
    }

    if (categoryId) {
      where.categoryId = parseInt(categoryId as string);
    }

    if (cityId) {
      where.cityId = parseInt(cityId as string);
    }

    if (status) {
      where.status = status;
    }

    if (isVerified !== undefined) {
      where.isVerified = isVerified === 'true';
    }

    let businesses = await prisma.business.findMany({
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
      orderBy: { [sortBy as string]: order },
    });

    // Location-based filtering
    if (latitude && longitude) {
      const userLat = parseFloat(latitude as string);
      const userLon = parseFloat(longitude as string);
      const maxRadius = parseFloat(radius as string);

      businesses = businesses
        .map((business) => {
          if (business.latitude && business.longitude) {
            const distance = calculateDistance(
              userLat,
              userLon,
              business.latitude,
              business.longitude
            );
            return { ...business, distance };
          }
          return { ...business, distance: null };
        })
        .filter((business) => business.distance === null || business.distance <= maxRadius)
        .sort((a, b) => {
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        });
    }

    const total = businesses.length;
    const paginatedBusinesses = businesses.slice(skip, skip + parseInt(limit as string));

    return sendSuccess(res, 200, 'Businesses fetched successfully', {
      businesses: paginatedBusinesses,
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

// Get all businesses for admin (all statuses)
export const getAllBusinessesAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '10', status } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = status ? { status } : {}; // No filter if no status

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        include: {
          category: true,
          city: true,
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
        fs.unlinkSync(files.logo[0].path);
      }
      
      if (files.coverImage && files.coverImage[0]) {
        coverImage = await uploadToCloudinary(files.coverImage[0], 'businesses/covers');
        fs.unlinkSync(files.coverImage[0].path);
      }
      
      if (files.images && files.images.length > 0) {
        const imageUploads = await Promise.all(
          files.images.map(async (file) => {
            const url = await uploadToCloudinary(file, 'businesses/gallery');
            fs.unlinkSync(file.path);
            return url;
          })
        );
        images = imageUploads;
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
        workingHours: workingHours ? JSON.parse(workingHours) : null,
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
    if (req.files) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      Object.values(files).flat().forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
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
        fs.unlinkSync(files.logo[0].path);
      }
      
      if (files.coverImage && files.coverImage[0]) {
        updateData.coverImage = await uploadToCloudinary(files.coverImage[0], 'businesses/covers');
        fs.unlinkSync(files.coverImage[0].path);
      }
      
      if (files.images && files.images.length > 0) {
        const imageUploads = await Promise.all(
          files.images.map(async (file) => {
            const url = await uploadToCloudinary(file, 'businesses/gallery');
            fs.unlinkSync(file.path);
            return url;
          })
        );
        updateData.images = imageUploads.length > 0 ? imageUploads : null;  // ← Changed
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
    
    if (req.files) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      Object.values(files).flat().forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
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

    const business = await prisma.business.update({
      where: { id },
      data: { status: 'REJECTED' },
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
        duration,
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