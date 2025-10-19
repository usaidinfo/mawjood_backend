import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';

// Get dashboard statistics
export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalUsers,
      totalBusinesses,
      pendingBusinesses,
      approvedBusinesses,
      totalReviews,
      totalPayments,
      totalCategories,
      totalCities,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.business.count(),
      prisma.business.count({ where: { status: 'PENDING' } }),
      prisma.business.count({ where: { status: 'APPROVED' } }),
      prisma.review.count(),
      prisma.payment.count(),
      prisma.category.count(),
      prisma.city.count(),
    ]);

    // Get recent businesses
    const recentBusinesses = await prisma.business.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        category: true,
        city: true,
      },
    });

    // Get recent users
    const recentUsers = await prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    // Payment statistics
    const [completedPayments, pendingPayments, totalRevenue] = await Promise.all([
      prisma.payment.count({ where: { status: 'COMPLETED' } }),
      prisma.payment.count({ where: { status: 'PENDING' } }),
      prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    const stats = {
      users: {
        total: totalUsers,
      },
      businesses: {
        total: totalBusinesses,
        pending: pendingBusinesses,
        approved: approvedBusinesses,
      },
      reviews: {
        total: totalReviews,
      },
      payments: {
        total: totalPayments,
        completed: completedPayments,
        pending: pendingPayments,
        totalRevenue: totalRevenue._sum.amount || 0,
      },
      categories: {
        total: totalCategories,
      },
      cities: {
        total: totalCities,
      },
      recentBusinesses,
      recentUsers,
    };

    return sendSuccess(res, 200, 'Dashboard stats fetched successfully', stats);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return sendError(res, 500, 'Failed to fetch dashboard stats', error);
  }
};

// Get all users with filters
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '10', search, role, status } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (status) {
      where.status = status;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
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
          _count: {
            select: {
              businesses: true,
              reviews: true,
              favourites: true,
            },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Users fetched successfully', {
      users,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    return sendError(res, 500, 'Failed to fetch users', error);
  }
};

// Get user by ID with details
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
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
        businesses: {
          include: {
            category: true,
            city: true,
          },
        },
        reviews: {
          include: {
            business: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        },
        favourites: {
          include: {
            business: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        },
        payments: {
          include: {
            business: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    return sendSuccess(res, 200, 'User fetched successfully', user);
  } catch (error) {
    console.error('Get user error:', error);
    return sendError(res, 500, 'Failed to fetch user', error);
  }
};

// Update user status
export const updateUserStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
      return sendError(res, 400, 'Invalid status. Must be ACTIVE, INACTIVE, or SUSPENDED');
    }

    const user = await prisma.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    return sendSuccess(res, 200, 'User status updated successfully', user);
  } catch (error) {
    console.error('Update user status error:', error);
    return sendError(res, 500, 'Failed to update user status', error);
  }
};

// Update user role
export const updateUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['USER', 'BUSINESS_OWNER', 'ADMIN'].includes(role)) {
      return sendError(res, 400, 'Invalid role. Must be USER, BUSINESS_OWNER, or ADMIN');
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    return sendSuccess(res, 200, 'User role updated successfully', user);
  } catch (error) {
    console.error('Update user role error:', error);
    return sendError(res, 500, 'Failed to update user role', error);
  }
};

// Delete user
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;

    // Prevent admin from deleting themselves
    if (id === currentUserId) {
      return sendError(res, 400, 'You cannot delete your own account');
    }

    await prisma.user.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'User deleted successfully');
  } catch (error) {
    console.error('Delete user error:', error);
    return sendError(res, 500, 'Failed to delete user', error);
  }
};

// Get pending businesses for approval
export const getPendingBusinesses = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '10' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where: { status: 'PENDING' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          category: true,
          city: {
            include: { region: true },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'asc' },
      }),
      prisma.business.count({ where: { status: 'PENDING' } }),
    ]);

    return sendSuccess(res, 200, 'Pending businesses fetched successfully', {
      businesses,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get pending businesses error:', error);
    return sendError(res, 500, 'Failed to fetch pending businesses', error);
  }
};

// Suspend business
export const suspendBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const business = await prisma.business.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });

    return sendSuccess(res, 200, 'Business suspended successfully', business);
  } catch (error) {
    console.error('Suspend business error:', error);
    return sendError(res, 500, 'Failed to suspend business', error);
  }
};

// Get analytics (monthly data)
export const getAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    // Get data for last 12 months
    const months = [];
    const currentDate = new Date();

    for (let i = 11; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);

      const [users, businesses, payments] = await Promise.all([
        prisma.user.count({
          where: {
            createdAt: {
              gte: date,
              lt: nextMonth,
            },
          },
        }),
        prisma.business.count({
          where: {
            createdAt: {
              gte: date,
              lt: nextMonth,
            },
          },
        }),
        prisma.payment.aggregate({
          where: {
            createdAt: {
              gte: date,
              lt: nextMonth,
            },
            status: 'COMPLETED',
          },
          _sum: {
            amount: true,
          },
          _count: true,
        }),
      ]);

      months.push({
        month: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
        users,
        businesses,
        payments: payments._count,
        revenue: payments._sum.amount || 0,
      });
    }

    return sendSuccess(res, 200, 'Analytics fetched successfully', { months });
  } catch (error) {
    console.error('Get analytics error:', error);
    return sendError(res, 500, 'Failed to fetch analytics', error);
  }
};