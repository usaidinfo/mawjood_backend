import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';
import { uploadToCloudinary } from '../config/cloudinary';

const prismaClient = prisma as any;
// Get all published blogs
export const getAllBlogs = async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '10',
      search,
      categorySlug,
      categoryId,
    } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { published: true };

    if (search) {
      const searchTerm = (search as string).trim();
      if (searchTerm.length) {
        where.OR = [
          { title: { contains: searchTerm } },
          { content: { contains: searchTerm } },
          { metaTitle: { contains: searchTerm } },
          { metaDescription: { contains: searchTerm } },
        ];
      }
    }

    const normalizedCategorySlug = typeof categorySlug === 'string' ? categorySlug.trim() : null;
    const normalizedCategoryId = typeof categoryId === 'string' ? categoryId.trim() : null;

    if (normalizedCategorySlug) {
      where.categories = {
        some: { slug: normalizedCategorySlug },
      };
    } else if (normalizedCategoryId) {
      where.categories = {
        some: { id: normalizedCategoryId },
      };
    }

    const [blogs, total] = await Promise.all([
      prismaClient.blog.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          categories: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
            },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prismaClient.blog.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Blogs fetched successfully', {
      blogs,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get blogs error:', error);
    return sendError(res, 500, 'Failed to fetch blogs', error);
  }
};

// Get blog by ID
export const getBlogById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const blog = await prismaClient.blog.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
          },
        },
      },
    });

    if (!blog) {
      return sendError(res, 404, 'Blog not found');
    }

    // Only show published blogs to public
    if (!blog.published) {
      return sendError(res, 404, 'Blog not found');
    }

    return sendSuccess(res, 200, 'Blog fetched successfully', blog);
  } catch (error) {
    console.error('Get blog error:', error);
    return sendError(res, 500, 'Failed to fetch blog', error);
  }
};

// Get blog by slug
export const getBlogBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const blog = await prismaClient.blog.findUnique({
      where: { slug },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
          },
        },
      },
    });

    if (!blog) {
      return sendError(res, 404, 'Blog not found');
    }

    if (!blog.published) {
      return sendError(res, 404, 'Blog not found');
    }

    return sendSuccess(res, 200, 'Blog fetched successfully', blog);
  } catch (error) {
    console.error('Get blog error:', error);
    return sendError(res, 500, 'Failed to fetch blog', error);
  }
};

// Create blog (Admin only)
export const createBlog = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const {
      title,
      slug,
      content,
      metaTitle,
      metaDescription,
      tags,
      published,
      categoryIds,
    } = req.body;

    if (!title || !slug || !content) {
      return sendError(res, 400, 'Title, slug, and content are required');
    }

    let parsedCategoryIds: string[] = [];
    if (categoryIds) {
      try {
        const payload = JSON.parse(categoryIds);
        if (Array.isArray(payload)) {
          parsedCategoryIds = payload
            .filter((id: unknown) => typeof id === 'string' && id.trim().length > 0)
            .map((id: string) => id.trim());
        } else {
          return sendError(res, 400, 'categoryIds must be an array of strings');
        }
      } catch (err) {
        return sendError(res, 400, 'Invalid categoryIds format. Expected JSON array of IDs');
      }
    }

    if (!parsedCategoryIds.length) {
      return sendError(res, 400, 'Please select at least one category for the blog');
    }

    const existingBlog = await prismaClient.blog.findUnique({
      where: { slug },
    });

    if (existingBlog) {
      return sendError(res, 409, 'Blog with this slug already exists');
    }

    let image = null;
    if (req.file) {
      image = await uploadToCloudinary(req.file, 'blogs');
    }

    const blog = await prismaClient.blog.create({
      data: {
        title,
        slug,
        content,
        image,
        metaTitle,
        metaDescription,
        tags: tags ? JSON.parse(tags) : null,
        published: published === 'true',
        authorId: userId!,
        categories: {
          connect: parsedCategoryIds.map((id) => ({ id })),
        },
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
          },
        },
      },
    });

    return sendSuccess(res, 201, 'Blog created successfully', blog);
  } catch (error) {
    console.error('Create blog error:', error);
    return sendError(res, 500, 'Failed to create blog', error);
  }
};

export const updateBlog = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      slug,
      content,
      metaTitle,
      metaDescription,
      tags,
      published,
      categoryIds,
    } = req.body;

    const updateData: any = {};
    if (title) updateData.title = title;
    if (slug) updateData.slug = slug;
    if (content) updateData.content = content;
    if (metaTitle !== undefined) updateData.metaTitle = metaTitle;
    if (metaDescription !== undefined) updateData.metaDescription = metaDescription;
    if (tags) updateData.tags = JSON.parse(tags);
    if (published !== undefined) updateData.published = published === 'true';

    let parsedCategoryIds: string[] | undefined;
    if (categoryIds !== undefined) {
      try {
        const payload = JSON.parse(categoryIds);
        if (Array.isArray(payload)) {
          parsedCategoryIds = payload
            .filter((catId: unknown) => typeof catId === 'string' && catId.trim().length > 0)
            .map((catId: string) => catId.trim());
        } else {
          return sendError(res, 400, 'categoryIds must be an array of strings');
        }
      } catch (err) {
        return sendError(res, 400, 'Invalid categoryIds format. Expected JSON array of IDs');
      }

      if (!parsedCategoryIds.length) {
        return sendError(res, 400, 'Please select at least one category for the blog');
      }

      updateData.categories = {
        set: parsedCategoryIds.map((catId) => ({ id: catId })),
      };
    }

    if (req.file) {
      updateData.image = await uploadToCloudinary(req.file, 'blogs');
    }

    const blog = await prismaClient.blog.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        categories: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
          },
        },
      },
    });

    return sendSuccess(res, 200, 'Blog updated successfully', blog);
  } catch (error) {
    console.error('Update blog error:', error);
    return sendError(res, 500, 'Failed to update blog', error);
  }
};

// Delete blog (Admin only)
export const deleteBlog = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.blog.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'Blog deleted successfully');
  } catch (error) {
    console.error('Delete blog error:', error);
    return sendError(res, 500, 'Failed to delete blog', error);
  }
};

// Get all blogs for admin (including unpublished)
export const getAllBlogsAdmin = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '10' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [blogs, total] = await Promise.all([
      prismaClient.blog.findMany({
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          categories: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
            },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prismaClient.blog.count(),
    ]);

    return sendSuccess(res, 200, 'All blogs fetched successfully', {
      blogs,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get all blogs error:', error);
    return sendError(res, 500, 'Failed to fetch blogs', error);
  }
};