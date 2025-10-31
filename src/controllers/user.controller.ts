import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';
import { hashPassword } from '../utils/password.util';
import { uploadToCloudinary } from '../config/cloudinary';

// Get user profile
export const getUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        avatar: true,
        emailVerified: true,
        phoneVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    return sendSuccess(res, 200, 'Profile fetched successfully', user);
  } catch (error) {
    console.error('Get profile error:', error);
    return sendError(res, 500, 'Failed to fetch profile', error);
  }
};

// Update user profile
export const updateUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { firstName, lastName } = req.body;

    let avatar = undefined;

    // Handle avatar upload
    if (req.file) {
      avatar = await uploadToCloudinary(req.file, 'users/avatars');
    }

    const updateData: any = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (avatar) updateData.avatar = avatar;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return sendSuccess(res, 200, 'Profile updated successfully', user);
  } catch (error) {
    console.error('Update profile error:', error);
    return sendError(res, 500, 'Failed to update profile', error);
  }
};


// Add to favourites
export const addToFavourites = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { businessId } = req.body;

    if (!businessId) {
      return sendError(res, 400, 'Business ID is required');
    }

    // Check if business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    // Check if already in favourites
    const existingFavourite = await prisma.favourite.findUnique({
      where: {
        userId_businessId: {
          userId: userId!,
          businessId,
        },
      },
    });

    if (existingFavourite) {
      return sendError(res, 409, 'Business already in favourites');
    }

    const favourite = await prisma.favourite.create({
      data: {
        userId: userId!,
        businessId,
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
            averageRating: true,
          },
        },
      },
    });

    return sendSuccess(res, 201, 'Added to favourites successfully', favourite);
  } catch (error) {
    console.error('Add to favourites error:', error);
    return sendError(res, 500, 'Failed to add to favourites', error);
  }
};

// Remove from favourites
export const removeFromFavourites = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { businessId } = req.params;

    const favourite = await prisma.favourite.findUnique({
      where: {
        userId_businessId: {
          userId: userId!,
          businessId,
        },
      },
    });

    if (!favourite) {
      return sendError(res, 404, 'Favourite not found');
    }

    await prisma.favourite.delete({
      where: {
        userId_businessId: {
          userId: userId!,
          businessId,
        },
      },
    });

    return sendSuccess(res, 200, 'Removed from favourites successfully');
  } catch (error) {
    console.error('Remove from favourites error:', error);
    return sendError(res, 500, 'Failed to remove from favourites', error);
  }
};

// Get user favourites
export const getUserFavourites = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const favourites = await prisma.favourite.findMany({
      where: { userId },
      include: {
        business: {
          include: {
            category: true,
            city: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Favourites fetched successfully', favourites);
  } catch (error) {
    console.error('Get favourites error:', error);
    return sendError(res, 500, 'Failed to fetch favourites', error);
  }
};

// Change password
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 400, 'Current password and new password are required');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.password) {
      return sendError(res, 404, 'User not found');
    }

    const { comparePassword } = await import('../utils/password.util');
    const isPasswordValid = await comparePassword(currentPassword, user.password);

    if (!isPasswordValid) {
      return sendError(res, 401, 'Current password is incorrect');
    }

    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return sendSuccess(res, 200, 'Password changed successfully');
  } catch (error) {
    console.error('Change password error:', error);
    return sendError(res, 500, 'Failed to change password', error);
  }
};