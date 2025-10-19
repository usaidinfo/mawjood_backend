import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';
import fs from 'fs';
import { uploadToCloudinary } from '../config/cloudinary';

// Get all categories with subcategories
export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      include: {
        subcategories: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    });

    return sendSuccess(res, 200, 'Categories fetched successfully', categories);
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
        fs.unlinkSync(files.icon[0].path);
      }
      
      if (files.image && files.image[0]) {
        image = await uploadToCloudinary(files.image[0], 'categories/images');
        fs.unlinkSync(files.image[0].path);
      }
    }

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        description,
        icon,
        image,
        order: order ? parseInt(order) : 0,
        parentId,
      },
    });

    return sendSuccess(res, 201, 'Category created successfully', category);
  } catch (error) {
    console.error('Create category error:', error);
    
    if (req.files) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      Object.values(files).flat().forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    return sendError(res, 500, 'Failed to create category', error);
  }
};

export const updateCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, description, order, parentId } = req.body;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (slug) updateData.slug = slug;
    if (description !== undefined) updateData.description = description;
    if (order !== undefined) updateData.order = parseInt(order);
    if (parentId !== undefined) updateData.parentId = parentId;

    // Handle file uploads
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (files) {
      if (files.icon && files.icon[0]) {
        updateData.icon = await uploadToCloudinary(files.icon[0], 'categories/icons');
        fs.unlinkSync(files.icon[0].path);
      }
      
      if (files.image && files.image[0]) {
        updateData.image = await uploadToCloudinary(files.image[0], 'categories/images');
        fs.unlinkSync(files.image[0].path);
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    return sendSuccess(res, 200, 'Category updated successfully', category);
  } catch (error) {
    console.error('Update category error:', error);
    
    if (req.files) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      Object.values(files).flat().forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
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