import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';
import { uploadToCloudinary } from '../config/cloudinary';

// Get all published blogs
export const getAllBlogs = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '10', search, tag } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { published: true };

    if (search) {
      where.OR = [
        { title: { contains: search as string } },
        { content: { contains: search as string } },
      ];
    }

    // if (tag) {
    //   where.tags = { has: tag as string };
    // }

    const [blogs, total] = await Promise.all([
      prisma.blog.findMany({
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
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.blog.count({ where }),
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

    const blog = await prisma.blog.findUnique({
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

    const blog = await prisma.blog.findUnique({
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
    const { title, slug, content, metaTitle, metaDescription, tags, published } = req.body;

    if (!title || !slug || !content) {
      return sendError(res, 400, 'Title, slug, and content are required');
    }

    const existingBlog = await prisma.blog.findUnique({
      where: { slug },
    });

    if (existingBlog) {
      return sendError(res, 409, 'Blog with this slug already exists');
    }

    let image = null;
    if (req.file) {
      image = await uploadToCloudinary(req.file, 'blogs');
    }

    const blog = await prisma.blog.create({
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
    const { title, slug, content, metaTitle, metaDescription, tags, published } = req.body;

    const updateData: any = {};
    if (title) updateData.title = title;
    if (slug) updateData.slug = slug;
    if (content) updateData.content = content;
    if (metaTitle !== undefined) updateData.metaTitle = metaTitle;
    if (metaDescription !== undefined) updateData.metaDescription = metaDescription;
    if (tags) updateData.tags = JSON.parse(tags);
    if (published !== undefined) updateData.published = published === 'true';

    if (req.file) {
      updateData.image = await uploadToCloudinary(req.file, 'blogs');
    }

    const blog = await prisma.blog.update({
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
      prisma.blog.findMany({
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.blog.count(),
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