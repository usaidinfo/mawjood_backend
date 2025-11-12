import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendError, sendSuccess } from '../utils/response.util';

const prismaClient = prisma as any;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const formatCategory = (category: any) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  description: category.description,
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
  blogCount: category._count?.blogs ?? 0,
});

export const getBlogCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await prismaClient.blogCategory.findMany({
      include: {
        _count: {
          select: { blogs: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return sendSuccess(res, 200, 'Blog categories fetched successfully', {
      categories: categories.map(formatCategory),
    });
  } catch (error) {
    console.error('Get blog categories error:', error);
    return sendError(res, 500, 'Failed to fetch blog categories', error);
  }
};

export const getBlogCategoryBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const category = await prismaClient.blogCategory.findUnique({
      where: { slug },
      include: {
        _count: {
          select: { blogs: true },
        },
      },
    });

    if (!category) {
      return sendError(res, 404, 'Blog category not found');
    }

    return sendSuccess(res, 200, 'Blog category fetched successfully', formatCategory(category));
  } catch (error) {
    console.error('Get blog category error:', error);
    return sendError(res, 500, 'Failed to fetch blog category', error);
  }
};

export const createBlogCategory = async (req: Request, res: Response) => {
  try {
    const { name, slug, description } = req.body;

    if (!name || !name.trim()) {
      return sendError(res, 400, 'Category name is required');
    }

    const finalSlug = slug && slug.trim().length ? slugify(slug) : slugify(name);

    const category = await prismaClient.blogCategory.create({
      data: {
        name: name.trim(),
        slug: finalSlug,
        description: description?.trim() || null,
      },
      include: {
        _count: {
          select: { blogs: true },
        },
      },
    });

    return sendSuccess(res, 201, 'Blog category created successfully', formatCategory(category));
  } catch (error: any) {
    console.error('Create blog category error:', error);
    if (error?.code === 'P2002') {
      return sendError(res, 409, 'Category slug already exists');
    }
    return sendError(res, 500, 'Failed to create blog category', error);
  }
};

export const updateBlogCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, description } = req.body;

    const updateData: any = {};

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return sendError(res, 400, 'Category name is required');
      }
      updateData.name = name.trim();
    }

    if (slug !== undefined) {
      if (!slug || !slug.trim()) {
        return sendError(res, 400, 'Category slug cannot be empty');
      }
      updateData.slug = slugify(slug);
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    const category = await prismaClient.blogCategory.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { blogs: true },
        },
      },
    });

    return sendSuccess(res, 200, 'Blog category updated successfully', formatCategory(category));
  } catch (error: any) {
    console.error('Update blog category error:', error);
    if (error?.code === 'P2025') {
      return sendError(res, 404, 'Blog category not found');
    }
    if (error?.code === 'P2002') {
      return sendError(res, 409, 'Category slug already exists');
    }
    return sendError(res, 500, 'Failed to update blog category', error);
  }
};

export const deleteBlogCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prismaClient.blogCategory.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'Blog category deleted successfully');
  } catch (error: any) {
    console.error('Delete blog category error:', error);
    if (error?.code === 'P2025') {
      return sendError(res, 404, 'Blog category not found');
    }
    return sendError(res, 500, 'Failed to delete blog category', error);
  }
};

