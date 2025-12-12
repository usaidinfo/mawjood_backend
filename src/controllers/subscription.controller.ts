import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { sendError, sendSuccess } from '../utils/response.util';
import { AuthRequest } from '../types';

const prismaClient = prisma as any;

const parseDecimal = (value: any): Prisma.Decimal | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(numeric)) return undefined;
  return new Prisma.Decimal(numeric);
};

type Interval = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM';

const computeEndDate = (start: Date, interval: Interval, count: number, customDays?: number | null) => {
  const end = new Date(start);
  const multiplier = count > 0 ? count : 1;

  switch (interval) {
    case 'DAY':
      end.setDate(end.getDate() + multiplier);
      break;
    case 'WEEK':
      end.setDate(end.getDate() + multiplier * 7);
      break;
    case 'MONTH':
      end.setMonth(end.getMonth() + multiplier);
      break;
    case 'YEAR':
      end.setFullYear(end.getFullYear() + multiplier);
      break;
    case 'CUSTOM':
      end.setDate(end.getDate() + (customDays ?? 0));
      break;
    default:
      end.setMonth(end.getMonth() + multiplier);
  }

  return end;
};

export const createBusinessSubscription = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { businessId, planId, startDate, notes, paymentReference, paymentProvider, metadata } = req.body;

    if (!businessId || !planId) {
      return sendError(res, 400, 'businessId and planId are required');
    }

    const [business, plan] = await Promise.all([
      prismaClient.business.findUnique({ where: { id: businessId } }),
      prismaClient.subscriptionPlan.findUnique({ where: { id: planId } }),
    ]);

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    if (userRole !== 'ADMIN' && business.userId !== userId) {
      return sendError(res, 403, 'You are not authorized to create subscriptions for this business');
    }

    if (business.status !== 'APPROVED') {
      return sendError(res, 400, 'Business must be approved before purchasing a subscription. Please wait for admin approval.');
    }

    if (!plan) {
      return sendError(res, 404, 'Subscription plan not found');
    }

    if (plan.status !== 'ACTIVE') {
      return sendError(res, 400, 'Subscription plan is not active');
    }

    const startsAt = startDate ? new Date(startDate) : new Date();
    const endsAt = computeEndDate(startsAt, plan.billingInterval, plan.intervalCount, plan.customIntervalDays);

    const price = plan.price;
    const effectivePrice = plan.salePrice ?? plan.price;
    const discountAmount = price.minus(effectivePrice);

    // Create subscription with PENDING status - will be activated when payment completes
    const subscription = await prismaClient.businessSubscription.create({
      data: {
        businessId,
        planId,
        status: 'PENDING', // Changed to PENDING - will be activated when payment completes
        startedAt: startsAt,
        endsAt,
        price,
        discountAmount,
        totalAmount: effectivePrice,
        paymentReference,
        paymentProvider,
        notes,
        metadata: metadata ?? null,
        createdById: userId ?? null,
      },
    });

    // Don't update business yet - wait for payment completion
    // Business will be updated when payment callback activates the subscription

    return sendSuccess(res, 201, 'Subscription created successfully', subscription);
  } catch (error) {
    console.error('Create business subscription error:', error);
    return sendError(res, 500, 'Failed to create subscription', error);
  }
};

export const getBusinessSubscriptions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { businessId, status, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    const where: any = {};
    
    // If businessId is provided, verify ownership (unless admin)
    if (businessId) {
      if (userRole !== 'ADMIN') {
        const business = await prismaClient.business.findUnique({
          where: { id: businessId as string },
        });
        if (!business || business.userId !== userId) {
          return sendError(res, 403, 'You are not authorized to view subscriptions for this business');
        }
      }
      where.businessId = businessId;
    } else if (userRole !== 'ADMIN') {
      // If no businessId, only show subscriptions for user's businesses
      const userBusinesses = await prismaClient.business.findMany({
        where: { userId: userId! },
        select: { id: true },
      });
      const businessIds = userBusinesses.map(b => b.id);
      if (businessIds.length === 0) {
        return sendSuccess(res, 200, 'Subscriptions fetched successfully', {
          subscriptions: [],
          pagination: {
            total: 0,
            page: parseInt(page as string, 10),
            limit: parseInt(limit as string, 10),
            totalPages: 0,
          },
        });
      }
      where.businessId = { in: businessIds };
    }
    
    if (status) {
      where.status = status;
    }

    // Check and update expired subscriptions before fetching
    const now = new Date();
    const expiredSubscriptions = await prismaClient.businessSubscription.findMany({
      where: {
        status: 'ACTIVE',
        endsAt: { lt: now },
      },
      include: {
        business: {
          select: {
            id: true,
            currentSubscriptionId: true,
          },
        },
      },
    });

    if (expiredSubscriptions.length > 0) {
      const expiredIds = expiredSubscriptions.map((sub: any) => sub.id);
      
      // Update expired subscriptions
      await prismaClient.businessSubscription.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'EXPIRED' },
      });

      // Update businesses that had these as current subscriptions
      const businessUpdates = expiredSubscriptions
        .filter((sub: any) => sub.business.currentSubscriptionId === sub.id)
        .map((sub: any) =>
          prismaClient.business.update({
            where: { id: sub.businessId },
            data: {
              currentSubscriptionId: null,
              canCreateAdvertisements: false,
              promotedUntil: null,
              isVerified: false,
            },
          })
        );

      if (businessUpdates.length > 0) {
        await Promise.all(businessUpdates);
      }
    }

    const [subscriptions, total] = await Promise.all([
      prismaClient.businessSubscription.findMany({
        where,
        include: {
          plan: true,
          business: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string, 10),
      }),
      prismaClient.businessSubscription.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Subscriptions fetched successfully', {
      subscriptions,
      pagination: {
        total,
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        totalPages: Math.ceil(total / parseInt(limit as string, 10)),
      },
    });
  } catch (error) {
    console.error('List business subscriptions error:', error);
    return sendError(res, 500, 'Failed to fetch subscriptions', error);
  }
};

export const getBusinessSubscriptionById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const subscription = await prismaClient.businessSubscription.findUnique({
      where: { id },
      include: {
        plan: true,
        business: { 
          select: { 
            id: true, 
            name: true, 
            slug: true,
            userId: true,
          } 
        },
      },
    });

    if (!subscription) {
      return sendError(res, 404, 'Subscription not found');
    }

    // Verify ownership (unless admin)
    if (userRole !== 'ADMIN' && subscription.business.userId !== userId) {
      return sendError(res, 403, 'You are not authorized to view this subscription');
    }

    return sendSuccess(res, 200, 'Subscription fetched successfully', subscription);
  } catch (error) {
    console.error('Get subscription error:', error);
    return sendError(res, 500, 'Failed to fetch subscription', error);
  }
};

export const cancelBusinessSubscription = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const subscription = await prismaClient.businessSubscription.findUnique({ 
      where: { id },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            userId: true,
            currentSubscriptionId: true,
          },
        },
        plan: {
          select: {
            name: true,
          },
        },
      },
    });
    
    if (!subscription) {
      return sendError(res, 404, 'Subscription not found');
    }

    // Verify ownership (unless admin)
    if (userRole !== 'ADMIN' && subscription.business.userId !== userId) {
      return sendError(res, 403, 'You are not authorized to cancel this subscription');
    }

    if (subscription.status !== 'ACTIVE') {
      return sendError(res, 400, 'Only active subscriptions can be cancelled');
    }

    const updated = await prismaClient.businessSubscription.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    if (subscription.business.currentSubscriptionId === id) {
      await prismaClient.business.update({
        where: { id: subscription.businessId },
        data: {
          currentSubscriptionId: null,
          subscriptionExpiresAt: updated.endsAt,
          canCreateAdvertisements: false,
          promotedUntil: null,
          isVerified: false,
        },
      });

      // Create notification for subscription cancellation
      const planName = subscription.plan?.name || 'subscription plan';
      await prismaClient.notification.create({
        data: {
          userId: subscription.business.userId,
          type: 'SUBSCRIPTION_CANCELLED',
          title: 'Subscription Cancelled',
          message: `Your subscription to "${planName}" for "${subscription.business.name}" has been cancelled. Your business will no longer be featured after the current period ends.`,
          link: `/dashboard/subscriptions`,
        },
      });
    }

    return sendSuccess(res, 200, 'Subscription cancelled successfully', updated);
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return sendError(res, 500, 'Failed to cancel subscription', error);
  }
};

export const syncExpiredSubscriptions = async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const expired = await prismaClient.businessSubscription.findMany({
      where: {
        status: 'ACTIVE',
        endsAt: { lt: now },
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        plan: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!expired.length) {
      return sendSuccess(res, 200, 'No expired subscriptions found', { processed: 0 });
    }

    const expiredIds = expired.map((item: any) => item.id);

    await prismaClient.businessSubscription.updateMany({
      where: { id: { in: expiredIds } },
      data: { status: 'EXPIRED' },
    });

    const businessUpdates = expired.map((item: any) =>
      prismaClient.business.update({
        where: { id: item.businessId },
        data: {
          currentSubscriptionId: null,
          canCreateAdvertisements: false,
          promotedUntil: null,
          isVerified: false,
        },
      })
    );

    // Create notifications for expired subscriptions
    const notifications = expired.map((item: any) =>
      prismaClient.notification.create({
        data: {
          userId: item.business.userId,
          type: 'SUBSCRIPTION_EXPIRED',
          title: 'Subscription Expired',
          message: `Your subscription to "${item.plan?.name || 'subscription plan'}" for "${item.business.name}" has expired. Your business is no longer featured. Renew your subscription to continue enjoying premium benefits.`,
          link: `/dashboard/subscriptions`,
        },
      })
    );

    await Promise.all([...businessUpdates, ...notifications]);

    return sendSuccess(res, 200, 'Expired subscriptions synced successfully', { processed: expired.length });
  } catch (error) {
    console.error('Sync expired subscriptions error:', error);
    return sendError(res, 500, 'Failed to sync expired subscriptions', error);
  }
};

// Check and notify about expiring subscriptions
export const checkExpiringSubscriptions = async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const oneDayFromNow = new Date(now);
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

    // IMPORTANT: Only check ACTIVE subscriptions for expiry
    // PENDING subscriptions should NEVER receive expiry emails since they're not activated yet
    // Also ensure the subscription has a payment reference (meaning payment was completed)
    const expiringSubscriptions = await prismaClient.businessSubscription.findMany({
      where: {
        status: 'ACTIVE', // Only ACTIVE subscriptions can expire
        paymentReference: {
          not: null, // Must have a payment reference (payment was completed)
        },
        endsAt: {
          gte: now,
          lte: sevenDaysFromNow,
        },
        // Explicitly exclude PENDING, FAILED, CANCELLED, and EXPIRED subscriptions
        NOT: {
          status: {
            in: ['PENDING', 'FAILED', 'CANCELLED', 'EXPIRED'],
          },
        },
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            userId: true,
            user: {
              select: {
                email: true,
              },
            },
          },
        },
        plan: {
          select: {
            name: true,
          },
        },
      },
    });

    console.log(`[Expiry Check] Found ${expiringSubscriptions.length} ACTIVE subscriptions expiring in the next 7 days`);

    if (!expiringSubscriptions.length) {
      return sendSuccess(res, 200, 'No expiring subscriptions found', { processed: 0 });
    }

    const notifications = [];
    const nowTime = now.getTime();

    for (const subscription of expiringSubscriptions) {
      if (subscription.status !== 'ACTIVE') {
        console.warn(`[Expiry Check] Skipping subscription ${subscription.id} - status is ${subscription.status}, not ACTIVE`);
        continue;
      }

      if (subscription.paymentReference && !subscription.paymentReference.startsWith('SPONSOR-')) {
        const payment = await prisma.payment.findFirst({
          where: {
            transactionId: subscription.paymentReference,
            status: 'COMPLETED',
          },
        });

        if (!payment) {
          console.warn(`[Expiry Check] Skipping subscription ${subscription.id} - associated payment ${subscription.paymentReference} is not COMPLETED`);
          continue;
        }
      }

      const endsAtTime = new Date(subscription.endsAt).getTime();
      const daysUntilExpiry = Math.ceil((endsAtTime - nowTime) / (1000 * 60 * 60 * 24));
      
      console.log(`[Expiry Check] Processing subscription ${subscription.id} for business ${subscription.business.name} - expires in ${daysUntilExpiry} days`);

      const existingNotification = await prismaClient.notification.findFirst({
        where: {
          userId: subscription.business.userId,
          type: 'SUBSCRIPTION_EXPIRING',
          message: {
            contains: subscription.plan?.name || 'subscription plan',
          },
          createdAt: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          },
        },
      });

      if (existingNotification) {
        continue; // Skip if notification already sent recently
      }

      let title = '';
      let message = '';

      if (daysUntilExpiry === 1) {
        title = 'Subscription Expiring Tomorrow! ⚠️';
        message = `Your subscription to "${subscription.plan?.name || 'subscription plan'}" for "${subscription.business.name}" expires tomorrow. Renew now to continue enjoying premium benefits!`;
      } else if (daysUntilExpiry <= 3) {
        title = 'Subscription Expiring Soon! ⚠️';
        message = `Your subscription to "${subscription.plan?.name || 'subscription plan'}" for "${subscription.business.name}" expires in ${daysUntilExpiry} days. Renew now to continue enjoying premium benefits!`;
      } else if (daysUntilExpiry <= 7) {
        title = 'Subscription Expiring Soon';
        message = `Your subscription to "${subscription.plan?.name || 'subscription plan'}" for "${subscription.business.name}" expires in ${daysUntilExpiry} days. Consider renewing to maintain your premium features.`;
      }

      if (title && message) {
        notifications.push(
          prismaClient.notification.create({
            data: {
              userId: subscription.business.userId,
              type: 'SUBSCRIPTION_EXPIRING',
              title,
              message,
              link: `/dashboard/subscriptions`,
            },
          })
        );

        // Send email notification
        if (subscription.business.user?.email) {
          try {
            const { emailService } = await import('../services/email.service');
            await emailService.sendSubscriptionExpiryEmail(
              subscription.business.user.email,
              subscription.business.name,
              subscription.plan?.name || 'subscription plan',
              new Date(subscription.endsAt),
              daysUntilExpiry
            );
          } catch (emailError) {
            console.error('Failed to send subscription expiry email:', emailError);
          }
        }
      }
    }

    if (notifications.length > 0) {
      await Promise.all(notifications);
    }

    return sendSuccess(res, 200, 'Expiring subscriptions checked successfully', { 
      processed: notifications.length,
      totalExpiring: expiringSubscriptions.length,
    });
  } catch (error) {
    console.error('Check expiring subscriptions error:', error);
    return sendError(res, 500, 'Failed to check expiring subscriptions', error);
  }
};

// Get all subscriptions (Admin only)
// Admin-only: Assign sponsor subscription to a business (no payment required)
export const assignSponsorSubscription = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId, planId, startDate, endsAt, notes } = req.body;
    const userRole = req.user?.role;
    const userId = req.user?.userId;

    // Only admins can assign sponsor subscriptions
    if (userRole !== 'ADMIN') {
      return sendError(res, 403, 'Only administrators can assign sponsor subscriptions');
    }

    if (!businessId) {
      return sendError(res, 400, 'businessId is required');
    }

    // Find business
    const business = await prismaClient.business.findUnique({ where: { id: businessId } });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    // Check if business already has an active sponsor subscription
    // First, check by plan.isSponsorPlan
    let existingActiveSponsorSubscription = await prismaClient.businessSubscription.findFirst({
      where: {
        businessId,
        status: 'ACTIVE',
        endsAt: {
          gt: new Date(), // Not expired yet
        },
        plan: {
          isSponsorPlan: true,
        },
      },
      include: {
        plan: true,
      },
    });

    // If not found, check by metadata.isSponsorSubscription
    if (!existingActiveSponsorSubscription) {
      const allActiveSubscriptions = await prismaClient.businessSubscription.findMany({
        where: {
          businessId,
          status: 'ACTIVE',
          endsAt: {
            gt: new Date(),
          },
        },
        include: {
          plan: true,
        },
      });

      // Check metadata for sponsor subscription
      existingActiveSponsorSubscription = allActiveSubscriptions.find((sub: any) => {
        const metadata = sub.metadata as any;
        return metadata?.isSponsorSubscription === true;
      }) || null;
    }

    if (existingActiveSponsorSubscription) {
      return sendError(
        res,
        400,
        `This business already has an active sponsor subscription that expires on ${new Date(existingActiveSponsorSubscription.endsAt).toLocaleDateString()}. Please wait until it expires before assigning a new one.`
      );
    }

    // Find or create default sponsor plan
    let plan;
    if (planId) {
      plan = await prismaClient.subscriptionPlan.findUnique({ where: { id: planId } });
      if (!plan) {
        return sendError(res, 404, 'Subscription plan not found');
      }
      // Verify it's a sponsor plan if provided (only if column exists)
      if (plan.isSponsorPlan === false) {
        return sendError(res, 400, 'Selected plan is not a sponsor plan. Use regular subscription creation for non-sponsor plans.');
      }
    } else {
      // Auto-create or find default sponsor plan
      try {
        plan = await prismaClient.subscriptionPlan.findFirst({
          where: { isSponsorPlan: true, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
        });
      } catch (error: any) {
        // If column doesn't exist, plan will be null and we'll create one
        if (error.code === 'P2022' && error.meta?.column?.includes('isSponsorPlan')) {
          console.warn('isSponsorPlan column does not exist yet - will create plan without it');
          plan = null;
        } else {
          throw error;
        }
      }

      if (!plan) {
        // Create default sponsor plan automatically
        const adminUser = await prismaClient.user.findFirst({
          where: { role: 'ADMIN' },
          select: { id: true },
        });

        const planData: any = {
          name: 'Sponsor Access',
          slug: `sponsor-access-${Date.now()}`,
          description: 'Default sponsor access plan - grants all premium features',
          price: new Prisma.Decimal(0),
          currency: 'SAR',
          status: 'ACTIVE',
          billingInterval: 'YEARLY',
          intervalCount: 1,
          verifiedBadge: true,
          topPlacement: true,
          allowAdvertisements: true,
          maxAdvertisements: 999,
          createdById: adminUser?.id || userId || null,
        };

        // Only add isSponsorPlan if column exists
        try {
          // Try to check if column exists by attempting a query
          await prismaClient.$queryRaw`SELECT isSponsorPlan FROM SubscriptionPlan LIMIT 1`;
          planData.isSponsorPlan = true;
        } catch (error: any) {
          // Column doesn't exist - skip it
          console.warn('isSponsorPlan column does not exist - creating plan without it');
        }

        try {
          plan = await prismaClient.subscriptionPlan.create({
            data: planData,
          });
          console.log('Created default sponsor plan:', plan.id);
        } catch (error: any) {
          console.error('Failed to create sponsor plan:', error);
          return sendError(res, 500, 'Failed to create default sponsor plan. Please create a sponsor plan manually first.', error);
        }
      }
    }

    // Ensure plan is defined
    if (!plan || !plan.id) {
      console.error('Plan is not defined after creation/finding');
      return sendError(res, 500, 'Failed to find or create sponsor plan');
    }

    const startsAt = startDate ? new Date(startDate) : new Date();
    let calculatedEndsAt: Date;
    
    if (endsAt) {
      calculatedEndsAt = new Date(endsAt);
    } else {
      calculatedEndsAt = computeEndDate(startsAt, plan.billingInterval, plan.intervalCount, plan.customIntervalDays);
    }

    // Create subscription with ACTIVE status (no payment required for sponsor plans)
    const subscription = await prismaClient.businessSubscription.create({
      data: {
        businessId,
        planId: plan.id, // Use the plan we found/created, not the request parameter
        status: 'ACTIVE',
        startedAt: startsAt,
        endsAt: calculatedEndsAt,
        price: plan.price,
        discountAmount: plan.price, // Full discount for sponsor plans
        totalAmount: new Prisma.Decimal(0), // Free for sponsor plans
        paymentReference: `SPONSOR-${Date.now()}`,
        paymentProvider: 'SPONSOR',
        notes: notes || 'Sponsor subscription assigned by admin',
        metadata: { isSponsorSubscription: true, assignedBy: userId },
        createdById: userId ?? null,
      },
    });

    const updateData: any = {
      currentSubscriptionId: subscription.id,
      subscriptionStartedAt: startsAt,
      subscriptionExpiresAt: calculatedEndsAt,
      canCreateAdvertisements: true, 
      promotedUntil: calculatedEndsAt, 
      isVerified: true, 
    };

    console.log('Updating business with sponsor features:', {
      businessId,
      updateData,
      planFeatures: {
        verifiedBadge: plan.verifiedBadge,
        topPlacement: plan.topPlacement,
        allowAdvertisements: plan.allowAdvertisements,
      },
    });

    const updatedBusiness = await prismaClient.business.update({
      where: { id: businessId },
      data: updateData,
    });

    console.log('Business updated successfully:', {
      id: updatedBusiness.id,
      isVerified: updatedBusiness.isVerified,
      promotedUntil: updatedBusiness.promotedUntil,
      canCreateAdvertisements: updatedBusiness.canCreateAdvertisements,
    });

    // Create notification for business owner
    await prismaClient.notification.create({
      data: {
        userId: business.userId,
        type: 'SUBSCRIPTION_ACTIVE',
        title: 'Sponsor Access Granted! 🎉',
        message: `Your business "${business.name}" has been granted ${plan.name} access by our team. Enjoy all premium features!`,
        link: `/dashboard/subscriptions`,
      },
    });

    return sendSuccess(res, 201, 'Sponsor subscription assigned successfully', subscription);
  } catch (error) {
    console.error('Assign sponsor subscription error:', error);
    return sendError(res, 500, 'Failed to assign sponsor subscription', error);
  }
};

export const getAllSubscriptions = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '100', status, businessId, search, startDate, endDate } = req.query;
    const skip = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (businessId) {
      where.businessId = businessId;
    }
    
    // Date range filtering
    if (startDate || endDate) {
      where.createdAt = {};
      
      if (startDate) {
        // Set to start of day
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        where.createdAt.gte = start;
      }
      
      if (endDate) {
        // Set to end of day
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    
    if (typeof search === 'string' && search.trim().length > 0) {
      const term = search.trim();
      where.OR = [
        {
          business: {
            is: {
              name: { contains: term },
            },
          },
        },
        {
          business: {
            is: {
              slug: { contains: term },
            },
          },
        },
        {
          plan: {
            is: {
              name: { contains: term },
            },
          },
        },
      ];
    }

    // First, check and update expired subscriptions
    const now = new Date();
    const expiredSubscriptions = await prismaClient.businessSubscription.findMany({
      where: {
        status: 'ACTIVE',
        endsAt: { lt: now },
      },
      include: {
        business: {
          select: {
            id: true,
            currentSubscriptionId: true,
          },
        },
      },
    });

    if (expiredSubscriptions.length > 0) {
      const expiredIds = expiredSubscriptions.map((sub: any) => sub.id);
      
      // Update expired subscriptions
      await prismaClient.businessSubscription.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'EXPIRED' },
      });

      // Update businesses that had these as current subscriptions
      const businessUpdates = expiredSubscriptions
        .filter((sub: any) => sub.business.currentSubscriptionId === sub.id)
        .map((sub: any) =>
          prismaClient.business.update({
            where: { id: sub.businessId },
            data: {
              currentSubscriptionId: null,
              canCreateAdvertisements: false,
              promotedUntil: null,
              isVerified: false,
            },
          })
        );

      if (businessUpdates.length > 0) {
        await Promise.all(businessUpdates);
      }
    }

    const [subscriptions, total] = await Promise.all([
      prismaClient.businessSubscription.findMany({
        where,
        include: {
          plan: true,
          business: {
            select: {
              id: true,
              name: true,
              slug: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string, 10),
      }),
      prismaClient.businessSubscription.count({ where }),
    ]);

    return sendSuccess(res, 200, 'All subscriptions fetched successfully', {
      subscriptions,
      pagination: {
        total,
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        totalPages: Math.ceil(total / parseInt(limit as string, 10)),
      },
    });
  } catch (error) {
    console.error('Get all subscriptions error:', error);
    return sendError(res, 500, 'Failed to fetch subscriptions', error);
  }
};