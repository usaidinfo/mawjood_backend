import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';
import { uploadToCloudinary } from '../config/cloudinary';

// Get all categories with subcategories
export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [categories, total] = await Promise.all([
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
        take: parseInt(limit as string),
      }),
      prisma.category.count({
        where: { parentId: null },
      }),
    ]);

    return sendSuccess(res, 200, 'Categories fetched successfully', {
      categories,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
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
        subcategories: true,
        businesses: {
          where: { status: 'APPROVED' },
          take: 10,
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

    const category = await prisma.category.findUnique({
      where: { slug },
      include: {
        subcategories: true,
        businesses: {
          where: { status: 'APPROVED' },
          take: 10,
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

    return sendSuccess(res, 200, 'Category deleted successfully');
  } catch (error) {
    console.error('Delete category error:', error);
    return sendError(res, 500, 'Failed to delete category', error);
  }
};