import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [overviewRow] = await prisma.$queryRaw<
      Array<{
        totalListings: bigint;
        activeListings: bigint;
        pendingListings: bigint;
        totalViews: bigint;
        todayViews: bigint;
        totalReviews: bigint;
        totalFavourites: bigint;
        totalBlogs: bigint;
        averageRating: number | null;
      }>
    >(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM Business WHERE userId = ${userId}) AS totalListings,
        (SELECT COUNT(*) FROM Business WHERE userId = ${userId} AND status = 'APPROVED') AS activeListings,
        (SELECT COUNT(*) FROM Business WHERE userId = ${userId} AND status = 'PENDING') AS pendingListings,
        (SELECT COUNT(*) FROM BusinessView v JOIN Business b ON b.id = v.businessId WHERE b.userId = ${userId}) AS totalViews,
        (SELECT COUNT(*) FROM BusinessView v JOIN Business b ON b.id = v.businessId WHERE b.userId = ${userId} AND v.viewedAt >= ${todayStart}) AS todayViews,
        (SELECT COUNT(*) FROM Review r JOIN Business b ON b.id = r.businessId WHERE b.userId = ${userId}) AS totalReviews,
        (SELECT COUNT(*) FROM Favourite f JOIN Business b ON b.id = f.businessId WHERE b.userId = ${userId}) AS totalFavourites,
        (SELECT COUNT(*) FROM Blog WHERE authorId = ${userId}) AS totalBlogs,
        (SELECT AVG(averageRating) FROM Business WHERE userId = ${userId}) AS averageRating
    `);

    const overviewMetrics = overviewRow
      ? {
          totalListings: Number(overviewRow.totalListings ?? 0n),
          activeListings: Number(overviewRow.activeListings ?? 0n),
          pendingListings: Number(overviewRow.pendingListings ?? 0n),
          totalViews: Number(overviewRow.totalViews ?? 0n),
          todayViews: Number(overviewRow.todayViews ?? 0n),
          totalReviews: Number(overviewRow.totalReviews ?? 0n),
          totalFavourites: Number(overviewRow.totalFavourites ?? 0n),
          totalBlogs: Number(overviewRow.totalBlogs ?? 0n),
          averageRating: overviewRow.averageRating
            ? Number(Number(overviewRow.averageRating).toFixed(1))
            : 0,
        }
      : {
          totalListings: 0,
          activeListings: 0,
          pendingListings: 0,
          totalViews: 0,
          todayViews: 0,
          totalReviews: 0,
          totalFavourites: 0,
          totalBlogs: 0,
          averageRating: 0,
        };

    if (!overviewMetrics.totalListings) {
      return res.json({
        success: true,
        data: {
          overview: overviewMetrics,
          viewsTrend: [],
          recentReviews: [],
        },
      });
    }

    const last7DaysRaw = await prisma.$queryRaw<
      Array<{
        date: Date;
        count: bigint;
      }>
    >(Prisma.sql`
      SELECT DATE(v.viewedAt) AS date, COUNT(*) AS count
      FROM BusinessView v
      JOIN Business b ON b.id = v.businessId
      WHERE b.userId = ${userId} AND v.viewedAt >= ${sevenDaysAgo}
      GROUP BY DATE(v.viewedAt)
    `);

    const recentReviews = await prisma.review.findMany({
      where: {
        business: {
          userId,
        },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        business: {
          select: {
            name: true,
          },
        },
      },
    });

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      const dayViews = last7DaysRaw.find((v) =>
        v.date.toISOString().split('T')[0] === dateString
      );

      last7Days.push({
        date: dateString,
        count: dayViews ? Number(dayViews.count) : 0,
      });
    }

    return res.json({
      success: true,
      data: {
        overview: {
          ...overviewMetrics,
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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [viewSummary] = await prisma.$queryRaw<
      Array<{
        totalViews: bigint;
        todayViews: bigint;
      }>
    >(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM BusinessView WHERE businessId = ${id}) AS totalViews,
        (SELECT COUNT(*) FROM BusinessView WHERE businessId = ${id} AND viewedAt >= ${todayStart}) AS todayViews
    `);

    const last30DaysRaw = await prisma.$queryRaw<
      Array<{
        date: Date;
        count: bigint;
      }>
    >(Prisma.sql`
      SELECT DATE(viewedAt) AS date, COUNT(*) AS count
      FROM BusinessView
      WHERE businessId = ${id} AND viewedAt >= ${thirtyDaysAgo}
      GROUP BY DATE(viewedAt)
    `);

    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      const dayViews = last30DaysRaw.find((v) =>
        v.date.toISOString().split('T')[0] === dateString
      );

      last30Days.push({
        date: dateString,
        count: dayViews ? Number(dayViews.count) : 0,
      });
    }

    return res.json({
      success: true,
      data: {
        businessName: business.name,
        totalViews: viewSummary ? Number(viewSummary.totalViews ?? 0n) : 0,
        todayViews: viewSummary ? Number(viewSummary.todayViews ?? 0n) : 0,
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