import { Request, Response } from 'express';
import prisma from '../config/database';

interface AuthRequest extends Request {
  user?: {
    userId: string;  // Change from id to userId
    email: string;
    role: string;
  };
}

export const getDashboardAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const userBusinesses = await prisma.business.findMany({
      where: { userId },
      select: { id: true }
    });

    const businessIds = userBusinesses.map(b => b.id);

    const activeListings = await prisma.business.count({
      where: { 
        userId,
        status: 'APPROVED'
      }
    });

    // Total Listings
    const totalListings = await prisma.business.count({
      where: { userId }
    });

    // Pending Listings
    const pendingListings = await prisma.business.count({
      where: { 
        userId,
        status: 'PENDING'
      }
    });

    // Total Views (across all businesses)
    const totalViews = await prisma.businessView.count({
      where: {
        businessId: { in: businessIds }
      }
    });

    // Today's Views
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayViews = await prisma.businessView.count({
      where: {
        businessId: { in: businessIds },
        viewedAt: { gte: todayStart }
      }
    });

    // Total Reviews
    const totalReviews = await prisma.review.count({
      where: {
        businessId: { in: businessIds }
      }
    });

    // Average Rating
    const businesses = await prisma.business.findMany({
      where: { userId },
      select: { averageRating: true }
    });
    
    const avgRating = businesses.length > 0
      ? businesses.reduce((sum, b) => sum + b.averageRating, 0) / businesses.length
      : 0;
    
    // Total Favourites
    const totalFavourites = await prisma.favourite.count({
      where: {
        businessId: { in: businessIds }
      }
    });

    // Total Blogs (if user is admin)
    const totalBlogs = await prisma.blog.count({
      where: { authorId: userId }
    });

    // Last 7 days views trend
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const last7DaysData = await prisma.businessView.groupBy({
      by: ['viewedAt'],
      where: {
        businessId: { in: businessIds },
        viewedAt: { gte: sevenDaysAgo }
      },
      _count: true
    });

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      
      const dayViews = last7DaysData.filter(v => 
        v.viewedAt.toISOString().split('T')[0] === dateString
      );
      
      last7Days.push({
        date: dateString,
        count: dayViews.length
      });
    }

    // Recent Reviews
    const recentReviews = await prisma.review.findMany({
      where: {
        businessId: { in: businessIds }
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatar: true
          }
        },
        business: {
          select: {
            name: true
          }
        }
      }
    });

    return res.json({
      success: true,
      data: {
        overview: {
          totalListings,
          activeListings,
          pendingListings,
          totalViews,
          todayViews,
          totalReviews,
          averageRating: Number(avgRating.toFixed(1)),
          totalFavourites,
          totalBlogs
        },
        viewsTrend: last7Days,
        recentReviews: recentReviews.slice(0, 5).map(r => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          businessName: r.business.name,
          userName: `${r.user.firstName} ${r.user.lastName}`,
          userAvatar: r.user.avatar,
          createdAt: r.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get dashboard analytics' 
    });
  }
};

export const getBusinessAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Check if user owns this business
    const business = await prisma.business.findFirst({
      where: { 
        id,
        userId 
      }
    });

    if (!business) {
      return res.status(404).json({ 
        success: false, 
        message: 'Business not found' 
      });
    }

    // Total views
    const totalViews = await prisma.businessView.count({
      where: { businessId: id }
    });

    // Today's views
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayViews = await prisma.businessView.count({
      where: {
        businessId: id,
        viewedAt: { gte: todayStart }
      }
    });

    // Last 30 days views
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const last30DaysData = await prisma.businessView.groupBy({
      by: ['viewedAt'],
      where: {
        businessId: id,
        viewedAt: { gte: thirtyDaysAgo }
      },
      _count: true
    });

    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      
      const dayViews = last30DaysData.filter(v => 
        v.viewedAt.toISOString().split('T')[0] === dateString
      );
      
      last30Days.push({
        date: dateString,
        count: dayViews.length
      });
    }

    return res.json({
      success: true,
      data: {
        businessName: business.name,
        totalViews,
        todayViews,
        totalReviews: business.totalReviews,
        averageRating: business.averageRating,
        viewsTrend: last30Days
      }
    });
  } catch (error) {
    console.error('Get business analytics error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get analytics' 
    });
  }
};

export const getMyDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId
    
    console.log('USER ID:', userId);  // Add this
    console.log('REQ.USER:', req.user);  // Add this

    // My businesses IDs
    const myBusinesses = await prisma.business.findMany({
      where: { userId },
      select: { id: true }
    });

    const businessIds = myBusinesses.map(b => b.id);

    // Total my listings
    const totalListings = myBusinesses.length;

    // Active listings
    const activeListings = await prisma.business.count({
      where: { userId, status: 'APPROVED' }
    });

    // Total views on MY businesses
    const totalViews = await prisma.businessView.count({
      where: { businessId: { in: businessIds } }
    });

    // Today's views
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayViews = await prisma.businessView.count({
      where: {
        businessId: { in: businessIds },
        viewedAt: { gte: todayStart }
      }
    });

    // Total reviews on MY businesses
    const totalReviews = await prisma.review.count({
      where: { businessId: { in: businessIds } }
    });

    // Total favourites on MY businesses
    const totalFavourites = await prisma.favourite.count({
      where: { businessId: { in: businessIds } }
    });

    // My blogs
    const myBlogs = await prisma.blog.count({
      where: { authorId: userId }
    });

    return res.json({
      success: true,
      data: {
        totalListings,
        activeListings,
        totalViews,
        todayViews,
        totalReviews,
        totalFavourites,
        myBlogs
      }
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get stats' 
    });
  }
};