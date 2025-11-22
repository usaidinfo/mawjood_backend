import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalUsers,
      totalBusinesses,
      pendingBusinesses,
      approvedBusinesses,
      rejectedBusinesses,
      suspendedBusinesses,
      totalReviews,
      totalPayments,
      totalCategories,
      totalCities,
      totalRegions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.business.count(),
      prisma.business.count({ where: { status: 'PENDING' } }),
      prisma.business.count({ where: { status: 'APPROVED' } }),
      prisma.business.count({ where: { status: 'REJECTED' } }),
      prisma.business.count({ where: { status: 'SUSPENDED' } }),
      prisma.review.count(),
      prisma.payment.count(),
      prisma.category.count(),
      prisma.city.count(),
      prisma.region.count(),
    ]);

    // Get pending businesses (limited to 5 for quick view)
    const pendingBusinessesList = await prisma.business.findMany({
      where: { status: 'PENDING' },
      take: 5,
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        category: {
          select: {
            name: true,
          },
        },
        city: {
          select: {
            name: true,
          },
        },
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

    // Business growth data (last 6 months)
    const businessGrowth = [];
    const currentDate = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);

      const count = await prisma.business.count({
        where: {
          createdAt: {
            gte: date,
            lt: nextMonth,
          },
        },
      });

      businessGrowth.push({
        month: date.toLocaleString('default', { month: 'short' }),
        year: date.getFullYear(),
        count,
      });
    }

    // Businesses by category (for pie chart)
    const businessesByCategory = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            businesses: true,
          },
        },
      },
      orderBy: {
        businesses: {
          _count: 'desc',
        },
      },
      take: 10, // Top 10 categories
    });

    const categoryData = businessesByCategory.map(cat => ({
      categoryId: cat.id,
      categoryName: cat.name,
      count: cat._count.businesses,
    }));

    // Businesses by city (for bar chart)
    const businessesByCity = await prisma.city.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            businesses: true,
          },
        },
      },
      orderBy: {
        businesses: {
          _count: 'desc',
        },
      },
      take: 10, // Top 10 cities
    });

    const cityData = businessesByCity.map(city => ({
      cityId: city.id,
      cityName: city.name,
      count: city._count.businesses,
    }));

    // Businesses by region (alternative for bar chart)
    const businessesByRegion = await prisma.region.findMany({
      select: {
        id: true,
        name: true,
        cities: {
          select: {
            _count: {
              select: {
                businesses: true,
              },
            },
          },
        },
      },
    });

    const regionData = businessesByRegion.map(region => ({
      regionId: region.id,
      regionName: region.name,
      count: region.cities.reduce((sum, city) => sum + city._count.businesses, 0),
    })).sort((a, b) => b.count - a.count);

    // Count active admins
    const activeAdmins = await prisma.user.count({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    const stats = {
      // Overview Stats
      overview: {
        totalUsers,
        totalBusinesses,
        totalReviews,
        totalPayments,
      },
      
      // Business Status Breakdown
      businessStatus: {
        pending: pendingBusinesses,
        approved: approvedBusinesses,
        rejected: rejectedBusinesses,
        suspended: suspendedBusinesses,
      },
      
      // Payment Stats
      payments: {
        total: totalPayments,
        completed: completedPayments,
        pending: pendingPayments,
        totalRevenue: totalRevenue._sum.amount || 0,
      },
      
      // System Overview
      system: {
        totalCategories,
        totalCities,
        totalRegions,
        activeAdmins,
      },
      
      // Charts Data
      charts: {
        businessGrowth, // Line chart - last 6 months
        businessesByCategory: categoryData, // Pie chart
        businessesByCity: cityData, // Bar chart
        businessesByRegion: regionData, // Alternative bar chart
      },
      
      // Pending Approvals (for quick action section)
      pendingApprovals: pendingBusinessesList,
      
      // Recent Users
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
        { firstName: { contains: search as string } },
        { lastName: { contains: search as string } },
        { email: { contains: search as string } },
        { phone: { contains: search as string } },
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

// Update user details
export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone) {
      return sendError(res, 400, 'First name, last name, email, and phone are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendError(res, 400, 'Invalid email format');
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return sendError(res, 404, 'User not found');
    }

    // Check if email is already taken by another user
    if (email !== existingUser.email) {
      const emailExists = await prisma.user.findFirst({
        where: {
          email,
          id: { not: id },
        },
      });

      if (emailExists) {
        return sendError(res, 409, 'Email is already taken by another user');
      }
    }

    // Update user
    const user = await prisma.user.update({
      where: { id },
      data: {
        firstName,
        lastName,
        email,
        phone,
      },
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

    return sendSuccess(res, 200, 'User updated successfully', user);
  } catch (error) {
    console.error('Update user error:', error);
    return sendError(res, 500, 'Failed to update user', error);
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
    const { page = '1', limit = '10', search } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { status: 'PENDING' };

    // Add search functionality
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const searchTerm = search.trim();
      const searchConditions: any[] = [
        { name: { contains: searchTerm } },
        { description: { contains: searchTerm } },
        { 
          user: {
            OR: [
              { firstName: { contains: searchTerm } },
              { lastName: { contains: searchTerm } },
              { email: { contains: searchTerm } },
            ],
          },
        },
        { 
          city: {
            name: { contains: searchTerm },
          },
        },
      ];

      // Combine status filter with search using AND
      where.AND = [
        { status: 'PENDING' },
        { OR: searchConditions },
      ];
      delete where.status;
    }

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
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
      prisma.business.count({ where }),
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
    const { reason } = req.body || {}; // Optional suspension reason

    const business = await prisma.business.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });

    // Create notification for business owner
    await prisma.notification.create({
      data: {
        userId: business.userId,
        type: 'BUSINESS_SUSPENDED',
        title: 'Business Suspended',
        message: `Your business "${business.name}" has been suspended. ${reason ? `Reason: ${reason}` : 'Please contact support for more details.'}`,
        link: `/dashboard/my-listings`,
      },
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

// Get all reviews (admin)
export const getAllReviews = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '100', search = '', deleteRequestStatus } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = {};

    if (deleteRequestStatus) {
      if (deleteRequestStatus === 'null') {
        where.deleteRequestStatus = null;
      } else {
        where.deleteRequestStatus = deleteRequestStatus;
      }
    }
    // If no deleteRequestStatus filter, show all reviews (no filter applied)

    if (search) {
      where.OR = [
        { comment: { contains: search as string, mode: 'insensitive' } },
        { user: { firstName: { contains: search as string, mode: 'insensitive' } } },
        { user: { lastName: { contains: search as string, mode: 'insensitive' } } },
        { business: { name: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          business: {
            select: {
              id: true,
              name: true,
              slug: true,
              logo: true,
            },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.review.count({ where }),
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
    console.error('Get all reviews error:', error);
    return sendError(res, 500, 'Failed to fetch reviews', error);
  }
};

// Get pending delete requests
export const getPendingDeleteRequests = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '100' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { deleteRequestStatus: 'PENDING' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          business: {
            select: {
              id: true,
              name: true,
              slug: true,
              logo: true,
            },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.review.count({ where: { deleteRequestStatus: 'PENDING' } }),
    ]);

    return sendSuccess(res, 200, 'Pending delete requests fetched successfully', {
      reviews,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get pending delete requests error:', error);
    return sendError(res, 500, 'Failed to fetch pending delete requests', error);
  }
};

// Approve delete request (actually deletes the review)
export const approveDeleteRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existingReview = await prisma.review.findUnique({
      where: { id },
    });

    if (!existingReview) {
      return sendError(res, 404, 'Review not found');
    }

    if (existingReview.deleteRequestStatus !== 'PENDING') {
      return sendError(res, 400, 'This review does not have a pending delete request');
    }

    const businessId = existingReview.businessId;

    // Delete the review
    await prisma.review.delete({
      where: { id },
    });

    // Update business average rating
    const reviews = await prisma.review.findMany({
      where: { businessId },
      select: { rating: true },
    });

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 
      ? reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews 
      : 0;

    await prisma.business.update({
      where: { id: businessId },
      data: {
        averageRating: parseFloat(averageRating.toFixed(2)),
        totalReviews,
      },
    });

    return sendSuccess(res, 200, 'Review deleted successfully');
  } catch (error) {
    console.error('Approve delete request error:', error);
    return sendError(res, 500, 'Failed to approve delete request', error);
  }
};

// Reject delete request
export const rejectDeleteRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existingReview = await prisma.review.findUnique({
      where: { id },
    });

    if (!existingReview) {
      return sendError(res, 404, 'Review not found');
    }

    if (existingReview.deleteRequestStatus !== 'PENDING') {
      return sendError(res, 400, 'This review does not have a pending delete request');
    }

    // Set delete request status to REJECTED
    await prisma.review.update({
      where: { id },
      data: {
        deleteRequestStatus: 'REJECTED',
      },
    });

    return sendSuccess(res, 200, 'Delete request rejected successfully');
  } catch (error) {
    console.error('Reject delete request error:', error);
    return sendError(res, 500, 'Failed to reject delete request', error);
  }
};