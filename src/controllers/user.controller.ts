import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';
import { hashPassword } from '../utils/password.util';
import { uploadToCloudinary } from '../config/cloudinary';
import { capitalizeUserNames } from '../utils/name.util';

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

    const capitalizedUser = capitalizeUserNames(user);
    return sendSuccess(res, 200, 'Profile fetched successfully', capitalizedUser);
  } catch (error) {
    console.error('Get profile error:', error);
    return sendError(res, 500, 'Failed to fetch profile', error);
  }
};

// Update user profile
export const updateUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { firstName, lastName, email, phone } = req.body;

    // Get current user to check verification status
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerified: true,
        phoneVerified: true,
        email: true,
        phone: true,
      },
    });

    if (!currentUser) {
      return sendError(res, 404, 'User not found');
    }

    let avatar = undefined;

    // Handle avatar upload
    if (req.file) {
      avatar = await uploadToCloudinary(req.file, 'users/avatars');
    }

    const updateData: any = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (avatar) updateData.avatar = avatar;

    // Only allow email update if not verified
    if (email !== undefined) {
      if (currentUser.emailVerified && currentUser.email) {
        return sendError(res, 400, 'Cannot update verified email');
      }
      // If email is provided and not empty, check if it's already taken
      if (email && email.trim()) {
        const emailExists = await prisma.user.findFirst({
          where: {
            email: email.trim(),
            id: { not: userId },
          },
        });
        if (emailExists) {
          return sendError(res, 409, 'Email is already taken');
        }
        updateData.email = email.trim();
        updateData.emailVerified = false; // Reset verification when email changes
      } else {
        // Allow setting email to null
        updateData.email = null;
        updateData.emailVerified = false;
      }
    }

    // Only allow phone update if not verified
    if (phone !== undefined) {
      if (currentUser.phoneVerified && currentUser.phone) {
        return sendError(res, 400, 'Cannot update verified phone number');
      }
      // If phone is provided and not empty, check if it's already taken
      if (phone && phone.trim()) {
        const phoneExists = await prisma.user.findFirst({
          where: {
            phone: phone.trim(),
            id: { not: userId },
          },
        });
        if (phoneExists) {
          return sendError(res, 409, 'Phone number is already taken');
        }
        updateData.phone = phone.trim();
        updateData.phoneVerified = false; // Reset verification when phone changes
      } else {
        // Allow setting phone to null
        updateData.phone = null;
        updateData.phoneVerified = false;
      }
    }

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
        emailVerified: true,
        phoneVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const capitalizedUser = capitalizeUserNames(user);
    return sendSuccess(res, 200, 'Profile updated successfully', capitalizedUser);
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