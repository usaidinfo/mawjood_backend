import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';
import { uploadToCloudinary } from '../config/cloudinary';

const prismaClient = prisma as any;

// Get all tourist places (Public - only active)
export const getAllTouristPlaces = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '10', citySlug, search } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { isActive: true };

    if (citySlug) {
      where.city = { slug: citySlug as string };
    }

    if (search) {
      const searchTerm = (search as string).trim();
      if (searchTerm.length) {
        where.OR = [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { subtitle: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }
    }

    const [touristPlaces, total] = await Promise.all([
      prismaClient.touristPlace.findMany({
        where,
        include: {
          city: {
            select: {
              id: true,
              name: true,
              slug: true,
              region: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  country: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
            },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prismaClient.touristPlace.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Tourist places fetched successfully', {
      touristPlaces,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get tourist places error:', error);
    return sendError(res, 500, 'Failed to fetch tourist places', error);
  }
};

// Get tourist place by slug (Public)
export const getTouristPlaceBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const touristPlace = await prismaClient.touristPlace.findUnique({
      where: { slug, isActive: true },
      include: {
        city: {
          select: {
            id: true,
            name: true,
            slug: true,
            region: {
              select: {
                id: true,
                name: true,
                slug: true,
                country: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
        },
        attractions: {
          orderBy: { order: 'asc' },
        },
        businessSections: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!touristPlace) {
      return sendError(res, 404, 'Tourist place not found');
    }

    return sendSuccess(res, 200, 'Tourist place fetched successfully', touristPlace);
  } catch (error) {
    console.error('Get tourist place error:', error);
    return sendError(res, 500, 'Failed to fetch tourist place', error);
  }
};

// Get tourist place by slug for admin (shows all regardless of active status)
export const getTouristPlaceBySlugAdmin = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const touristPlace = await prismaClient.touristPlace.findUnique({
      where: { slug },
      include: {
        city: {
          select: {
            id: true,
            name: true,
            slug: true,
            region: {
              select: {
                id: true,
                name: true,
                slug: true,
                country: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
        },
        attractions: {
          orderBy: { order: 'asc' },
        },
        businessSections: {
          orderBy: { order: 'asc' },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!touristPlace) {
      return sendError(res, 404, 'Tourist place not found');
    }

    return sendSuccess(res, 200, 'Tourist place fetched successfully', touristPlace);
  } catch (error) {
    console.error('Get tourist place error:', error);
    return sendError(res, 500, 'Failed to fetch tourist place', error);
  }
};

// Get all tourist places for admin
export const getAllTouristPlacesAdmin = async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '10',
      cityId,
      citySlug,
      search,
      isActive,
    } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};

    if (cityId) {
      where.cityId = cityId as string;
    }

    if (citySlug) {
      where.city = { slug: citySlug as string };
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    if (search) {
      const searchTerm = (search as string).trim();
      if (searchTerm.length) {
        where.OR = [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { subtitle: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }
    }

    const [touristPlaces, total] = await Promise.all([
      prismaClient.touristPlace.findMany({
        where,
        include: {
          city: {
            select: {
              id: true,
              name: true,
              slug: true,
              region: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  country: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: {
              attractions: true,
              businessSections: true,
            },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prismaClient.touristPlace.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Tourist places fetched successfully', {
      touristPlaces,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get tourist places error:', error);
    return sendError(res, 500, 'Failed to fetch tourist places', error);
  }
};

// Create tourist place (Admin only)
export const createTouristPlace = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    let {
      title,
      slug,
      subtitle,
      galleryImages,
      about,
      metaTitle,
      metaDescription,
      keywords,
      cityId,
      bestTimeToVisit,
      attractions,
      businessSections,
      isActive = 'true',
    } = req.body;
    
    // Parse JSON strings from FormData
    if (typeof attractions === 'string') {
      try {
        attractions = JSON.parse(attractions);
      } catch (e) {
        attractions = [];
      }
    }
    
    if (typeof businessSections === 'string') {
      try {
        businessSections = JSON.parse(businessSections);
      } catch (e) {
        businessSections = [];
      }
    }
    
    if (typeof bestTimeToVisit === 'string') {
      try {
        bestTimeToVisit = JSON.parse(bestTimeToVisit);
      } catch (e) {
        bestTimeToVisit = null;
      }
    }
    
    isActive = isActive === 'true' || isActive === true;
    
    // Parse JSON strings from FormData
    if (typeof attractions === 'string') {
      try {
        attractions = JSON.parse(attractions);
      } catch (e) {
        attractions = [];
      }
    }
    
    if (typeof businessSections === 'string') {
      try {
        businessSections = JSON.parse(businessSections);
      } catch (e) {
        businessSections = [];
      }
    }
    
    if (typeof bestTimeToVisit === 'string') {
      try {
        bestTimeToVisit = JSON.parse(bestTimeToVisit);
      } catch (e) {
        bestTimeToVisit = null;
      }
    }
    
    isActive = isActive === 'true' || isActive === true;

    if (!title || !slug || !cityId) {
      return sendError(res, 400, 'Title, slug, and cityId are required');
    }

    // Check if slug already exists
    const existingPlace = await prismaClient.touristPlace.findUnique({
      where: { slug },
    });

    if (existingPlace) {
      return sendError(res, 400, 'Slug already exists');
    }

    // Verify city exists
    const city = await prismaClient.city.findUnique({
      where: { id: cityId },
    });

    if (!city) {
      return sendError(res, 400, 'City not found');
    }

    // Handle file uploads for gallery images
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    let uploadedGalleryImages: string[] = [];

    if (files && files.galleryImages && files.galleryImages.length > 0) {
      const imageUploads = await Promise.all(
        files.galleryImages.map(async (file) => {
          return await uploadToCloudinary(file, 'tourist-places/gallery');
        })
      );
      uploadedGalleryImages = imageUploads;
    }

    // Handle file uploads for attraction images
    let uploadedAttractionImages: string[] = [];
    if (files && files.attractionImages && files.attractionImages.length > 0) {
      const attractionImageUploads = await Promise.all(
        files.attractionImages.map(async (file) => {
          return await uploadToCloudinary(file, 'tourist-places/attractions');
        })
      );
      uploadedAttractionImages = attractionImageUploads;
    }

    // Parse JSON fields
    let parsedGalleryImages: string[] = uploadedGalleryImages;
    
    // If galleryImages is provided in body (for existing images or URLs), merge with uploaded
    if (galleryImages) {
      const existingImages = typeof galleryImages === 'string' 
        ? JSON.parse(galleryImages) 
        : galleryImages;
      if (Array.isArray(existingImages)) {
        parsedGalleryImages = [...uploadedGalleryImages, ...existingImages];
      }
    }

    let parsedKeywords = null;
    if (keywords) {
      try {
        parsedKeywords = typeof keywords === 'string' 
          ? JSON.parse(keywords) 
          : keywords;
      } catch (e) {
        parsedKeywords = null;
      }
    }

    let parsedBestTimeToVisit = bestTimeToVisit;
    if (bestTimeToVisit && typeof bestTimeToVisit === 'string') {
      try {
        parsedBestTimeToVisit = JSON.parse(bestTimeToVisit);
      } catch (e) {
        parsedBestTimeToVisit = null;
      }
    }

    // Create tourist place
    const touristPlace = await prismaClient.touristPlace.create({
      data: {
        title,
        slug,
        subtitle,
        galleryImages: parsedGalleryImages.length > 0 ? parsedGalleryImages : null,
        about,
        metaTitle,
        metaDescription,
        keywords: parsedKeywords,
        cityId,
        bestTimeToVisit: parsedBestTimeToVisit,
        isActive,
        createdById: userId,
      },
    });

    // Create attractions if provided
    if (attractions && Array.isArray(attractions) && attractions.length > 0) {
      // Map uploaded images to attractions (by index)
      let attractionImageIndex = 0;
      
      await prismaClient.touristPlaceAttraction.createMany({
        data: attractions.map((attraction: any, index: number) => {
          // If attraction has an image URL, use it; otherwise use uploaded image if available
          let imageUrl = attraction.image || '';
          
          // If no image URL but we have uploaded images, use the next uploaded image
          if (!imageUrl && uploadedAttractionImages.length > attractionImageIndex) {
            imageUrl = uploadedAttractionImages[attractionImageIndex];
            attractionImageIndex++;
          }
          
          return {
            name: attraction.name || '',
            image: imageUrl,
            rating: attraction.rating ? parseFloat(attraction.rating) : 0,
            description: attraction.description || null,
            openTime: attraction.openTime || null,
            closeTime: attraction.closeTime || null,
            status: attraction.status || null,
            order: attraction.order !== undefined ? parseInt(attraction.order) : index,
            touristPlaceId: touristPlace.id,
          };
        }),
      });
    }

    // Create business sections if provided
    if (businessSections && Array.isArray(businessSections) && businessSections.length > 0) {
      await prismaClient.touristPlaceBusinessSection.createMany({
        data: businessSections.map((section: any, index: number) => {
          let categoryIdsArray: string[] = [];
          if (section.categoryIds) {
            if (typeof section.categoryIds === 'string') {
              try {
                categoryIdsArray = JSON.parse(section.categoryIds);
              } catch (e) {
                categoryIdsArray = [];
              }
            } else if (Array.isArray(section.categoryIds)) {
              categoryIdsArray = section.categoryIds;
            }
          }
          
          return {
            title: section.title || '',
            categoryIds: categoryIdsArray,
            order: section.order !== undefined ? parseInt(section.order) : index,
            touristPlaceId: touristPlace.id,
          };
        }),
      });
    }

    const result = await prismaClient.touristPlace.findUnique({
      where: { id: touristPlace.id },
      include: {
        city: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        attractions: {
          orderBy: { order: 'asc' },
        },
        businessSections: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return sendSuccess(res, 201, 'Tourist place created successfully', result);
  } catch (error: any) {
    console.error('Create tourist place error:', error);
    if (error.code === 'P2002') {
      return sendError(res, 400, 'Slug already exists');
    }
    return sendError(res, 500, 'Failed to create tourist place', error);
  }
};

// Update tourist place (Admin only)
export const updateTouristPlace = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    let {
      title,
      slug,
      subtitle,
      galleryImages,
      about,
      metaTitle,
      metaDescription,
      keywords,
      cityId,
      bestTimeToVisit,
      attractions,
      businessSections,
      isActive,
    } = req.body;
    
    // Parse JSON strings from FormData
    if (typeof attractions === 'string') {
      try {
        attractions = JSON.parse(attractions);
      } catch (e) {
        attractions = [];
      }
    }
    
    if (typeof businessSections === 'string') {
      try {
        businessSections = JSON.parse(businessSections);
      } catch (e) {
        businessSections = [];
      }
    }
    
    if (typeof bestTimeToVisit === 'string') {
      try {
        bestTimeToVisit = JSON.parse(bestTimeToVisit);
      } catch (e) {
        bestTimeToVisit = null;
      }
    }
    
    // Convert isActive from string to boolean
    let parsedIsActive: boolean | undefined = undefined;
    if (isActive !== undefined) {
      parsedIsActive = isActive === 'true' || isActive === true || isActive === '1' || isActive === 1;
    }

    const existingPlace = await prismaClient.touristPlace.findUnique({
      where: { id },
    });

    if (!existingPlace) {
      return sendError(res, 404, 'Tourist place not found');
    }

    // Check if slug is being changed and if it already exists
    if (slug && slug !== existingPlace.slug) {
      const slugExists = await prismaClient.touristPlace.findUnique({
        where: { slug },
      });
      if (slugExists) {
        return sendError(res, 400, 'Slug already exists');
      }
    }

    // Verify city exists if cityId is being updated
    if (cityId && cityId !== existingPlace.cityId) {
      const city = await prismaClient.city.findUnique({
        where: { id: cityId },
      });
      if (!city) {
        return sendError(res, 400, 'City not found');
      }
    }

    // Handle file uploads for gallery images
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    let uploadedGalleryImages: string[] = [];

    if (files && files.galleryImages && files.galleryImages.length > 0) {
      const imageUploads = await Promise.all(
        files.galleryImages.map(async (file) => {
          return await uploadToCloudinary(file, 'tourist-places/gallery');
        })
      );
      uploadedGalleryImages = imageUploads;
    }

    // Handle file uploads for attraction images
    let uploadedAttractionImages: string[] = [];
    if (files && files.attractionImages && files.attractionImages.length > 0) {
      const attractionImageUploads = await Promise.all(
        files.attractionImages.map(async (file) => {
          return await uploadToCloudinary(file, 'tourist-places/attractions');
        })
      );
      uploadedAttractionImages = attractionImageUploads;
    }

    // Parse JSON fields
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (slug !== undefined) updateData.slug = slug;
    if (subtitle !== undefined) updateData.subtitle = subtitle;
    if (about !== undefined) updateData.about = about;
    if (metaTitle !== undefined) updateData.metaTitle = metaTitle;
    if (metaDescription !== undefined) updateData.metaDescription = metaDescription;
    if (cityId !== undefined) updateData.cityId = cityId;
    if (parsedIsActive !== undefined) {
      updateData.isActive = parsedIsActive;
    }

    // Handle gallery images - merge existing with new uploads
    if (galleryImages !== undefined || uploadedGalleryImages.length > 0) {
      const existingImages = existingPlace.galleryImages 
        ? (Array.isArray(existingPlace.galleryImages) 
            ? existingPlace.galleryImages 
            : JSON.parse(existingPlace.galleryImages as any))
        : [];
      
      let finalImages: string[] = [];
      
      if (galleryImages !== undefined) {
        // If galleryImages is provided, use it (replaces existing)
        finalImages = typeof galleryImages === 'string' 
          ? JSON.parse(galleryImages) 
          : galleryImages;
      } else {
        // Otherwise keep existing images
        finalImages = Array.isArray(existingImages) ? existingImages : [];
      }
      
      // Add newly uploaded images
      if (uploadedGalleryImages.length > 0) {
        finalImages = [...finalImages, ...uploadedGalleryImages];
      }
      
      updateData.galleryImages = finalImages.length > 0 ? finalImages : null;
    }

    if (keywords !== undefined) {
      updateData.keywords = typeof keywords === 'string' 
        ? JSON.parse(keywords) 
        : keywords;
    }

    if (bestTimeToVisit !== undefined) {
      updateData.bestTimeToVisit = typeof bestTimeToVisit === 'string' 
        ? JSON.parse(bestTimeToVisit) 
        : bestTimeToVisit;
    }

    // Update tourist place
    await prismaClient.touristPlace.update({
      where: { id },
      data: updateData,
    });

    // Handle attractions update
    if (attractions !== undefined) {
      // Delete existing attractions
      await prismaClient.touristPlaceAttraction.deleteMany({
        where: { touristPlaceId: id },
      });

      // Create new attractions
      if (Array.isArray(attractions) && attractions.length > 0) {
        // Map uploaded images to attractions (by index)
        let attractionImageIndex = 0;
        
        await prismaClient.touristPlaceAttraction.createMany({
          data: attractions.map((attraction: any, index: number) => {
            // If attraction has an image URL, use it; otherwise use uploaded image if available
            let imageUrl = attraction.image || '';
            
            // If no image URL but we have uploaded images, use the next uploaded image
            if (!imageUrl && uploadedAttractionImages.length > attractionImageIndex) {
              imageUrl = uploadedAttractionImages[attractionImageIndex];
              attractionImageIndex++;
            }
            
            return {
              name: attraction.name || '',
              image: imageUrl,
              rating: attraction.rating ? parseFloat(attraction.rating) : 0,
              description: attraction.description || null,
              openTime: attraction.openTime || null,
              closeTime: attraction.closeTime || null,
              status: attraction.status || null,
              order: attraction.order !== undefined ? parseInt(attraction.order) : index,
              touristPlaceId: id,
            };
          }),
        });
      }
    }

    // Handle business sections update
    if (businessSections !== undefined) {
      // Delete existing business sections
      await prismaClient.touristPlaceBusinessSection.deleteMany({
        where: { touristPlaceId: id },
      });

      // Create new business sections
      if (Array.isArray(businessSections) && businessSections.length > 0) {
        await prismaClient.touristPlaceBusinessSection.createMany({
          data: businessSections.map((section: any, index: number) => ({
            title: section.title,
            categoryIds: typeof section.categoryIds === 'string' 
              ? JSON.parse(section.categoryIds) 
              : section.categoryIds,
            order: section.order !== undefined ? section.order : index,
            touristPlaceId: id,
          })),
        });
      }
    }

    const result = await prismaClient.touristPlace.findUnique({
      where: { id },
      include: {
        city: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        attractions: {
          orderBy: { order: 'asc' },
        },
        businessSections: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return sendSuccess(res, 200, 'Tourist place updated successfully', result);
  } catch (error: any) {
    console.error('Update tourist place error:', error);
    if (error.code === 'P2002') {
      return sendError(res, 400, 'Slug already exists');
    }
    return sendError(res, 500, 'Failed to update tourist place', error);
  }
};

// Delete tourist place (Admin only)
export const deleteTouristPlace = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const touristPlace = await prismaClient.touristPlace.findUnique({
      where: { id },
    });

    if (!touristPlace) {
      return sendError(res, 404, 'Tourist place not found');
    }

    await prismaClient.touristPlace.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'Tourist place deleted successfully');
  } catch (error) {
    console.error('Delete tourist place error:', error);
    return sendError(res, 500, 'Failed to delete tourist place', error);
  }
};

// Get businesses for a tourist place business section
export const getTouristPlaceBusinesses = async (req: Request, res: Response) => {
  try {
    const { slug, sectionId } = req.params;
    const { page = '1', limit = '10' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const touristPlace = await prismaClient.touristPlace.findUnique({
      where: { slug, isActive: true },
      include: {
        city: {
          select: { id: true },
        },
      },
    });

    if (!touristPlace) {
      return sendError(res, 404, 'Tourist place not found');
    }

    const businessSection = await prismaClient.touristPlaceBusinessSection.findUnique({
      where: { id: sectionId },
    });

    if (!businessSection) {
      return sendError(res, 404, 'Business section not found');
    }

    const categoryIds = Array.isArray(businessSection.categoryIds)
      ? businessSection.categoryIds
      : typeof businessSection.categoryIds === 'string'
      ? JSON.parse(businessSection.categoryIds)
      : [];

    const where: any = {
      cityId: touristPlace.city.id,
      status: 'APPROVED',
      categoryId: { in: categoryIds },
    };

    const [businesses, total] = await Promise.all([
      prismaClient.business.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: [
          { averageRating: 'desc' },
          { totalReviews: 'desc' },
        ],
      }),
      prismaClient.business.count({ where }),
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
    console.error('Get tourist place businesses error:', error);
    return sendError(res, 500, 'Failed to fetch businesses', error);
  }
};

