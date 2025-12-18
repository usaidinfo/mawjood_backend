import { Request, Response } from 'express';
import prisma, { withConnectionRetry } from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';
import { uploadToCloudinary } from '../config/cloudinary';

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

// Increased cache TTL to 10 minutes since categories don't change frequently
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const getCategoryCache = () => {
  const globalRef = globalThis as typeof globalThis & {
    __categoryCache?: Map<string, CacheEntry<any>>;
  };

  if (!globalRef.__categoryCache) {
    globalRef.__categoryCache = new Map();
  }

  return globalRef.__categoryCache;
};

const clearCategoryCache = () => {
  const globalRef = globalThis as typeof globalThis & {
    __categoryCache?: Map<string, CacheEntry<any>>;
  };
  if (globalRef.__categoryCache) {
    globalRef.__categoryCache.clear();
  }
};

// Get all categories with subcategories
export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', search } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const searchTerm = typeof search === 'string' ? search.trim() : '';

    const categoryCache = getCategoryCache();
    
    // For search queries, don't use cache and always query database
    if (searchTerm) {
      const limitNum = parseInt(limit as string);
      
      // Search in both parent categories and subcategories
      // First, find all categories (parent or child) that match the search
      const allMatchingCategories = await withConnectionRetry(async () => {
        return await prisma.category.findMany({
          where: {
            OR: [
              { name: { contains: searchTerm } },
              { description: { contains: searchTerm } },
            ],
          },
          select: {
            id: true,
            parentId: true,
          },
        });
      });

      // Get all unique parent IDs (either the category itself if it's a parent, or its parentId)
      const parentIds = new Set<string>();
      allMatchingCategories.forEach(cat => {
        if (cat.parentId) {
          parentIds.add(cat.parentId);
        } else {
          parentIds.add(cat.id);
        }
      });

      // Now fetch all parent categories that either match or have matching subcategories
      const where: any = {
        OR: [
          { id: { in: Array.from(parentIds) } },
          {
            subcategories: {
              some: {
                OR: [
                  { name: { contains: searchTerm } },
                  { description: { contains: searchTerm } },
                ],
              },
            },
          },
        ],
      };

      const [categories, total] = await withConnectionRetry(async () => {
        return await Promise.all([
          prisma.category.findMany({
            where,
            include: {
              subcategories: {
                where: {
                  OR: [
                    { name: { contains: searchTerm } },
                    { description: { contains: searchTerm } },
                  ],
                },
                orderBy: { order: 'asc' },
              },
              _count: {
                select: {
                  subcategories: true,
                  businesses: true,
                },
              },
            },
            orderBy: { order: 'asc' },
            take: limitNum,
          }),
          prisma.category.count({ where }),
        ]);
      });

      const responsePayload = {
        categories,
        pagination: {
          total,
          page: parseInt(page as string),
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      };

      return sendSuccess(res, 200, 'Categories fetched successfully', responsePayload);
    }
    
    // Check if we have ALL categories cached (without pagination)
    // This optimizes for the common case where frontend fetches all categories
    const allCategoriesCacheKey = 'all_categories_no_pagination';
    const allCachedResponse = categoryCache.get(allCategoriesCacheKey);
    
    if (allCachedResponse && allCachedResponse.expiresAt > Date.now()) {
      // We have all categories cached, just paginate from cache
      const allCategories = allCachedResponse.value.categories;
      const total = allCachedResponse.value.total;
      const paginatedCategories = allCategories.slice(skip, skip + parseInt(limit as string));
      
      console.log('[CACHE HIT] Returning paginated categories from cache');
      return sendSuccess(res, 200, 'Categories fetched successfully (cached)', {
        categories: paginatedCategories,
        pagination: {
          total,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    }

    // Check specific pagination cache (only if not using "all categories" cache)
    const cacheKey = JSON.stringify({ page, limit });
    const cachedResponse = categoryCache.get(cacheKey);
    if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
      console.log('[CACHE HIT] Returning cached categories response');
      return sendSuccess(res, 200, 'Categories fetched successfully (cached)', cachedResponse.value);
    }

    // If limit is high (>=100), fetch ALL categories at once and cache them
    // This optimizes for the common pattern where frontend fetches all categories
    const limitNum = parseInt(limit as string);
    if (limitNum >= 100) {
      const [allCategories, total] = await withConnectionRetry(async () => {
        return await Promise.all([
          prisma.category.findMany({
            where: { parentId: null },
            include: {
              subcategories: {
                orderBy: { order: 'asc' },
              },
              _count: {
                select: {
                  subcategories: true,
                  businesses: true,
                },
              },
            },
            orderBy: { order: 'asc' },
          }),
          prisma.category.count({
            where: { parentId: null },
          }),
        ]);
      });

      // Cache ALL categories for future pagination requests
      categoryCache.set(allCategoriesCacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value: {
          categories: allCategories,
          total,
        },
      });
      console.log('[CACHE] Stored all categories for future pagination');

      // Paginate from the fetched result
      const paginatedCategories = allCategories.slice(skip, skip + limitNum);
      const responsePayload = {
        categories: paginatedCategories,
        pagination: {
          total,
          page: parseInt(page as string),
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      };

      // Also cache this specific pagination
      categoryCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value: responsePayload,
      });

      return sendSuccess(res, 200, 'Categories fetched successfully', responsePayload);
    }

    // For smaller limits, use paginated query - reuse single connection
    const [categories, total] = await withConnectionRetry(async () => {
      return await Promise.all([
        prisma.category.findMany({
          where: { parentId: null },
          include: {
            subcategories: {
              orderBy: { order: 'asc' },
            },
            _count: {
              select: {
                subcategories: true,
                businesses: true,
              },
            },
          },
          orderBy: { order: 'asc' },
          skip,
          take: limitNum,
        }),
        prisma.category.count({
          where: { parentId: null },
        }),
      ]);
    });

    const responsePayload = {
      categories,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };

    // Cache the paginated response
    categoryCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value: responsePayload,
    });

    return sendSuccess(res, 200, 'Categories fetched successfully', responsePayload);
  } catch (error) {
    console.error('Get categories error:', error);
    return sendError(res, 500, 'Failed to fetch categories', error);
  }
};

// Get single category
export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        subcategories: {
          include: {
            _count: {
              select: {
                businesses: true,
              },
            },
          },
        },
        businesses: {
          where: { status: 'APPROVED' },
          take: 10,
        },
        _count: {
          select: {
            subcategories: true,
            businesses: true,
          },
        },
      },
    });

    if (!category) {
      return sendError(res, 404, 'Category not found');
    }

    return sendSuccess(res, 200, 'Category fetched successfully', category);
  } catch (error) {
    console.error('Get category error:', error);
    return sendError(res, 500, 'Failed to fetch category', error);
  }
};

// Get category by slug
export const getCategoryBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const categoryCache = getCategoryCache();
    const cacheKey = `category_slug_${slug}`;
    
    // Check cache first
    const cachedResponse = categoryCache.get(cacheKey);
    if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
      console.log(`[CACHE HIT] Returning cached category by slug: ${slug}`);
      return sendSuccess(res, 200, 'Category fetched successfully (cached)', cachedResponse.value);
    }

    // Fetch from database - reuse single connection
    const category = await withConnectionRetry(async () => {
      return await prisma.category.findUnique({
        where: { slug },
        include: {
          subcategories: {
            include: {
              _count: {
                select: {
                  businesses: true,
                },
              },
            },
          },
          businesses: {
            where: { status: 'APPROVED' },
            take: 10,
          },
          _count: {
            select: {
              subcategories: true,
              businesses: true,
            },
          },
        },
      });
    });

    if (!category) {
      return sendError(res, 404, 'Category not found');
    }

    // Cache the response
    categoryCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value: category,
    });

    return sendSuccess(res, 200, 'Category fetched successfully', category);
  } catch (error) {
    console.error('Get category error:', error);
    return sendError(res, 500, 'Failed to fetch category', error);
  }
};

// Create category (Admin only)
export const createCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug, description, order, parentId } = req.body;

    if (!name || !slug) {
      return sendError(res, 400, 'Name and slug are required');
    }

    const existingCategory = await prisma.category.findUnique({
      where: { slug },
    });

    if (existingCategory) {
      return sendError(res, 409, 'Category with this slug already exists');
    }

    // Handle file uploads
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    let icon = null;
    let image = null;

    if (files) {
      if (files.icon && files.icon[0]) {
        icon = await uploadToCloudinary(files.icon[0], 'categories/icons');
      }
      
      if (files.image && files.image[0]) {
        image = await uploadToCloudinary(files.image[0], 'categories/images');
      }
    }

    // Auto-assign order if not provided
    let finalOrder: number | null = null;
    
    if (order !== undefined && order !== null && order !== '') {
      const parsedOrder = parseInt(order as string);
      if (!isNaN(parsedOrder)) {
        finalOrder = parsedOrder;
      }
    }
    
    if (finalOrder === null) {
      // Find the maximum order for categories with the same parentId
      const maxOrderResult = await prisma.category.aggregate({
        where: {
          parentId: parentId || null,
        },
        _max: {
          order: true,
        },
      });
      
      // If no categories exist with this parentId, start from 0, otherwise add 1 to max
      finalOrder = maxOrderResult._max.order !== null 
        ? maxOrderResult._max.order + 1 
        : 0;
    }

    const orderConflict = await prisma.category.findFirst({
      where: {
        parentId: parentId || null,
        order: finalOrder,
      },
    });

    if (orderConflict) {
      return sendError(
        res,
        400,
        'Display order already in use for this level. Please choose a different value.'
      );
    }

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        description,
        icon,
        image,
        order: finalOrder,
        parentId: parentId || null,
      },
    });

    // Clear cache after creating category
    clearCategoryCache();

    return sendSuccess(res, 201, 'Category created successfully', category);
  } catch (error) {
    console.error('Create category error:', error);
    
    
    return sendError(res, 500, 'Failed to create category', error);
  }
};

export const updateCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, description, order, parentId } = req.body;

    const existingCategory = await prisma.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      return sendError(res, 404, 'Category not found');
    }

    let targetParentId: string | null = existingCategory.parentId;
    if (parentId !== undefined) {
      if (parentId && parentId === id) {
        return sendError(res, 400, 'A category cannot be its own parent');
      }
      targetParentId = parentId ? parentId : null;
    }

    let finalOrder: number;
    if (order !== undefined && order !== null && order !== '') {
      const parsedOrder = parseInt(order as string);
      if (isNaN(parsedOrder)) {
        return sendError(res, 400, 'Display order must be a valid number');
      }
      finalOrder = parsedOrder;
    } else if (targetParentId !== existingCategory.parentId) {
      const maxOrderResult = await prisma.category.aggregate({
        where: {
          parentId: targetParentId,
        },
        _max: {
          order: true,
        },
      });
      finalOrder =
        maxOrderResult._max.order !== null ? maxOrderResult._max.order + 1 : 0;
    } else {
      finalOrder = existingCategory.order;
    }

    const orderConflict = await prisma.category.findFirst({
      where: {
        parentId: targetParentId,
        order: finalOrder,
        NOT: { id },
      },
    });

    if (orderConflict) {
      return sendError(
        res,
        400,
        'Display order already in use for this level. Please choose a different value.'
      );
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (slug) updateData.slug = slug;
    if (description !== undefined) updateData.description = description;
    updateData.order = finalOrder;
    updateData.parentId = targetParentId;

    // Handle file uploads
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (files) {
      if (files.icon && files.icon[0]) {
        updateData.icon = await uploadToCloudinary(files.icon[0], 'categories/icons');
      }
      
      if (files.image && files.image[0]) {
        updateData.image = await uploadToCloudinary(files.image[0], 'categories/images');
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    // Clear cache after updating category
    clearCategoryCache();

    return sendSuccess(res, 200, 'Category updated successfully', category);
  } catch (error) {
    console.error('Update category error:', error);
    
    
    return sendError(res, 500, 'Failed to update category', error);
  }
};

// Delete category (Admin only)
export const deleteCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.category.delete({
      where: { id },
    });

    // Clear cache after deleting category
    clearCategoryCache();

    return sendSuccess(res, 200, 'Category deleted successfully');
  } catch (error) {
    console.error('Delete category error:', error);
    return sendError(res, 500, 'Failed to delete category', error);
  }
};