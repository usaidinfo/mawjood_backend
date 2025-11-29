import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';
import { uploadToCloudinary } from '../config/cloudinary';

const prismaClient = prisma as any;

type BlogPublishStatus = 'DRAFT' | 'PUBLISHED' | 'SCHEDULED';

const normalizeBlogStatus = (input?: unknown, fallbackPublished?: boolean): BlogPublishStatus => {
  if (typeof input === 'string') {
    const upper = input.toUpperCase();
    if (upper === 'DRAFT' || upper === 'PUBLISHED' || upper === 'SCHEDULED') {
      return upper as BlogPublishStatus;
    }
  }
  if (fallbackPublished) return 'PUBLISHED';
  return 'DRAFT';
};

const buildBlogMetaFromTags = (
  rawTags: unknown,
  status?: BlogPublishStatus,
  scheduledAt?: string | null
) => {
  let base: any = null;

  if (rawTags) {
    try {
      const parsed = typeof rawTags === 'string' ? JSON.parse(rawTags as string) : rawTags;
      // We allow tags to be either an array of strings or an object
      if (Array.isArray(parsed)) {
        base = { tags: parsed };
      } else if (parsed && typeof parsed === 'object') {
        base = { ...(parsed as any) };
      }
    } catch {
      // ignore parse errors and start fresh
      base = {};
    }
  }

  if (!base || typeof base !== 'object') {
    base = {};
  }

  if (status) {
    base.status = status;
  }

  if (scheduledAt) {
    base.scheduledAt = scheduledAt;
  } else if (base.scheduledAt) {
    // remove stale schedule info if status changed away from scheduled
    delete base.scheduledAt;
  }

  return base;
};

const attachBlogStatus = (blog: any) => {
  let status: BlogPublishStatus = blog.published ? 'PUBLISHED' : 'DRAFT';
  let scheduledAt: string | null = null;

  const tags = blog?.tags as any;
  if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
    const rawStatus = (tags as any).status;
    if (typeof rawStatus === 'string') {
      const norm = normalizeBlogStatus(rawStatus, blog.published);
      status = norm;
    }
    if (typeof (tags as any).scheduledAt === 'string') {
      scheduledAt = (tags as any).scheduledAt;
    }
  }

  return {
    ...blog,
    status,
    scheduledAt,
  };
};
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

    const [blogsRaw, total] = await Promise.all([
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

    const blogs = blogsRaw
      .map((b: any) => attachBlogStatus(b))
      .filter((blog: any) => {
        // Filter out scheduled blogs that haven't reached their publish time yet
        if (blog.status === 'SCHEDULED' && blog.scheduledAt) {
          const scheduledDate = new Date(blog.scheduledAt);
          const now = new Date();
          return scheduledDate <= now; // Only show if scheduled time has passed
        }
        return true; // Show all PUBLISHED and DRAFT (though DRAFT already filtered by published:true)
      });

    // Recalculate total after filtering scheduled blogs
    const filteredTotal = blogs.length;

    return sendSuccess(res, 200, 'Blogs fetched successfully', {
      blogs,
      pagination: {
        total: filteredTotal,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(filteredTotal / parseInt(limit as string)),
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

    const response = attachBlogStatus(blog);

    return sendSuccess(res, 200, 'Blog fetched successfully', response);
  } catch (error) {
    console.error('Get blog error:', error);
    return sendError(res, 500, 'Failed to fetch blog', error);
  }
};

// Get blog by slug (Public - only shows published blogs)
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

    // if (!blog.published) {
    //   return sendError(res, 404, 'Blog not found');
    // }

    const response = attachBlogStatus(blog);

    // Prevent viewing scheduled blogs before their scheduled time
    if (response.status === 'SCHEDULED' && response.scheduledAt) {
      const scheduledDate = new Date(response.scheduledAt);
      const now = new Date();
      if (scheduledDate > now) {
        return sendError(res, 404, 'Blog not found');
      }
    }

    return sendSuccess(res, 200, 'Blog fetched successfully', response);
  } catch (error) {
    console.error('Get blog error:', error);
    return sendError(res, 500, 'Failed to fetch blog', error);
  }
};

// Get blog by slug for admin (shows all blogs regardless of published status)
export const getBlogBySlugAdmin = async (req: Request, res: Response) => {
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

    const response = attachBlogStatus(blog);

    return sendSuccess(res, 200, 'Blog fetched successfully', response);
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
      status,
      scheduledAt,
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

    const normalizedStatus = normalizeBlogStatus(status, published === 'true' || published === true);

    let finalPublished = normalizedStatus !== 'DRAFT';
    let scheduledAtIso: string | null = null;

    if (normalizedStatus === 'SCHEDULED') {
      if (!scheduledAt || typeof scheduledAt !== 'string' || !scheduledAt.trim()) {
        return sendError(res, 400, 'Please provide a valid schedule date and time');
      }
      const parsedDate = new Date(scheduledAt);
      if (isNaN(parsedDate.getTime())) {
        return sendError(res, 400, 'Invalid schedule date and time');
      }
      // store ISO string; front-end will decide when to show based on this
      scheduledAtIso = parsedDate.toISOString();
      // keep published true so that scheduled posts are available to the frontend;
      // frontend will handle visibility based on scheduledAt vs current time.
      finalPublished = true;
    }

    const meta = buildBlogMetaFromTags(tags, normalizedStatus, scheduledAtIso);

    const blog = await prismaClient.blog.create({
      data: {
        title,
        slug,
        content,
        image,
        metaTitle,
        metaDescription,
        tags: meta,
        published: finalPublished,
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

    const response = attachAllBlogStatus(blog);

    return sendSuccess(res, 201, 'Blog created successfully', response);
  } catch (error) {
    console.error('Create blog error:', error);
    return sendError(res, 500, 'Failed to create blog', error);
  }
};

const attachAllBlogStatus = (blog: any) => {
  return attachBlogStatus(blog);
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
      status,
      scheduledAt,
      categoryIds,
    } = req.body;

    const updateData: any = {};
    if (title) updateData.title = title;
    if (slug) updateData.slug = slug;
    if (content) updateData.content = content;
    if (metaTitle !== undefined) updateData.metaTitle = metaTitle;
    if (metaDescription !== undefined) updateData.metaDescription = metaDescription;
    if (tags) {
      // If explicit tags provided, merge status/scheduledAt into them below
      updateData._rawTags = tags;
    }

    const normalizedStatus = status ? normalizeBlogStatus(status) : undefined;
    let scheduledAtIso: string | null | undefined;
    if (typeof scheduledAt === 'string' && scheduledAt.trim()) {
      const parsed = new Date(scheduledAt);
      if (isNaN(parsed.getTime())) {
        return sendError(res, 400, 'Invalid schedule date and time');
      }
      scheduledAtIso = parsed.toISOString();
    }

    // Determine final published flag
    if (normalizedStatus) {
      if (normalizedStatus === 'DRAFT') {
        updateData.published = false;
      } else {
        // For PUBLISHED or SCHEDULED we keep published=true so it is queryable;
        // frontend will decide visibility based on status/scheduledAt.
        updateData.published = true;
      }
    } else if (published !== undefined) {
      // Fallback for older clients that only send published boolean
      // Handle both string and boolean values
      updateData.published = published === 'true' || published === true;
    }

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

    // Merge tags/status/scheduledAt
    // If tags were explicitly provided in the request, use them as base. Otherwise, start from existing tags.
    let baseTags: any = undefined;
    if (updateData._rawTags) {
      try {
        const parsed = JSON.parse(updateData._rawTags);
        baseTags = parsed;
      } catch {
        baseTags = undefined;
      }
      delete updateData._rawTags;
    } else if (normalizedStatus || typeof scheduledAtIso === 'string') {
      const existing = await prismaClient.blog.findUnique({
        where: { id },
        select: { tags: true },
      });
      baseTags = existing?.tags ?? null;
    }

    if (baseTags !== undefined || normalizedStatus || typeof scheduledAtIso === 'string') {
      const meta = buildBlogMetaFromTags(baseTags, normalizedStatus, scheduledAtIso ?? null);
      updateData.tags = meta;
    }

    const blogUpdated = await prismaClient.blog.update({
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

    const response = attachAllBlogStatus(blogUpdated);

    return sendSuccess(res, 200, 'Blog updated successfully', response);
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

export const getAllBlogsAdmin = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '10', search = '' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { title: { contains: term } },
        { slug: { contains: term } },
        { metaTitle: { contains: term } },
        { metaDescription: { contains: term } },
        { content: { contains: term } },
      ];
    }

    const [blogsRaw, total] = await Promise.all([
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

    const blogs = blogsRaw.map((b: any) => attachBlogStatus(b));

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