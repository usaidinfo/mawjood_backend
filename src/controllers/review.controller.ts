import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest, ReviewDTO } from '../types';

// Get reviews for a business
export const getBusinessReviews = async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const { page = '1', limit = '10' } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { businessId },
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
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.review.count({ where: { businessId } }),
    ]);

    return sendSuccess(res, 200, 'Reviews fetched successfully', {
      reviews,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    return sendError(res, 500, 'Failed to fetch reviews', error);
  }
};

// Create review (authenticated users)
export const createReview = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { rating, comment, businessId }: ReviewDTO = req.body;

    if (!rating || !businessId) {
      return sendError(res, 400, 'Rating and businessId are required');
    }

    if (rating < 1 || rating > 5) {
      return sendError(res, 400, 'Rating must be between 1 and 5');
    }

    // Check if business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    // Check if user already reviewed this business
    const existingReview = await prisma.review.findUnique({
      where: {
        userId_businessId: {
          userId: userId!,
          businessId,
        },
      },
    });

    if (existingReview) {
      return sendError(res, 409, 'You have already reviewed this business');
    }

    // Create review
    const review = await prisma.review.create({
      data: {
        rating,
        comment,
        userId: userId!,
        businessId,
      },
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
    });

    // Update business average rating and total reviews
    const reviews = await prisma.review.findMany({
      where: { businessId },
      select: { rating: true },
    });

    const totalReviews = reviews.length;
    const averageRating = reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews;

    await prisma.business.update({
      where: { id: businessId },
      data: {
        averageRating: parseFloat(averageRating.toFixed(2)),
        totalReviews,
      },
    });

    return sendSuccess(res, 201, 'Review created successfully', review);
  } catch (error) {
    console.error('Create review error:', error);
    return sendError(res, 500, 'Failed to create review', error);
  }
};

// Update review
export const updateReview = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const { rating, comment } = req.body;

    const existingReview = await prisma.review.findUnique({
      where: { id },
    });

    if (!existingReview) {
      return sendError(res, 404, 'Review not found');
    }

    if (existingReview.userId !== userId) {
      return sendError(res, 403, 'You are not authorized to update this review');
    }

    if (rating && (rating < 1 || rating > 5)) {
      return sendError(res, 400, 'Rating must be between 1 and 5');
    }

    const review = await prisma.review.update({
      where: { id },
      data: { rating, comment },
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
    });

    // Update business average rating
    const reviews = await prisma.review.findMany({
      where: { businessId: existingReview.businessId },
      select: { rating: true },
    });

    const averageRating = reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;

    await prisma.business.update({
      where: { id: existingReview.businessId },
      data: {
        averageRating: parseFloat(averageRating.toFixed(2)),
      },
    });

    return sendSuccess(res, 200, 'Review updated successfully', review);
  } catch (error) {
    console.error('Update review error:', error);
    return sendError(res, 500, 'Failed to update review', error);
  }
};

// Delete review
export const deleteReview = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const existingReview = await prisma.review.findUnique({
      where: { id },
    });

    if (!existingReview) {
      return sendError(res, 404, 'Review not found');
    }

    // Only owner or admin can delete
    if (existingReview.userId !== userId && userRole !== 'ADMIN') {
      return sendError(res, 403, 'You are not authorized to delete this review');
    }

    await prisma.review.delete({
      where: { id },
    });

    // Update business average rating
    const reviews = await prisma.review.findMany({
      where: { businessId: existingReview.businessId },
      select: { rating: true },
    });

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 
      ? reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews 
      : 0;

    await prisma.business.update({
      where: { id: existingReview.businessId },
      data: {
        averageRating: parseFloat(averageRating.toFixed(2)),
        totalReviews,
      },
    });

    return sendSuccess(res, 200, 'Review deleted successfully');
  } catch (error) {
    console.error('Delete review error:', error);
    return sendError(res, 500, 'Failed to delete review', error);
  }
};

// Get user's reviews
export const getUserReviews = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const reviews = await prisma.review.findMany({
      where: { userId },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Your reviews fetched successfully', reviews);
  } catch (error) {
    console.error('Get user reviews error:', error);
    return sendError(res, 500, 'Failed to fetch your reviews', error);
  }
};