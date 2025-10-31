import { Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';

// Get user notifications
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { page = '1', limit = '20', unreadOnly = 'false' } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { userId };
    
    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return sendSuccess(res, 200, 'Notifications fetched successfully', {
      notifications,
      unreadCount,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return sendError(res, 500, 'Failed to fetch notifications', error);
  }
};

// Mark notification as read
export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return sendError(res, 404, 'Notification not found');
    }

    if (notification.userId !== userId) {
      return sendError(res, 403, 'Unauthorized');
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return sendSuccess(res, 200, 'Notification marked as read', updated);
  } catch (error) {
    console.error('Mark notification as read error:', error);
    return sendError(res, 500, 'Failed to mark notification as read', error);
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return sendSuccess(res, 200, 'All notifications marked as read');
  } catch (error) {
    console.error('Mark all as read error:', error);
    return sendError(res, 500, 'Failed to mark all notifications as read', error);
  }
};

// Delete notification
export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return sendError(res, 404, 'Notification not found');
    }

    if (notification.userId !== userId) {
      return sendError(res, 403, 'Unauthorized');
    }

    await prisma.notification.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'Notification deleted successfully');
  } catch (error) {
    console.error('Delete notification error:', error);
    return sendError(res, 500, 'Failed to delete notification', error);
  }
};

// Get unread count
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const count = await prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return sendSuccess(res, 200, 'Unread count fetched successfully', { count });
  } catch (error) {
    console.error('Get unread count error:', error);
    return sendError(res, 500, 'Failed to fetch unread count', error);
  }
};