import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { sendError, sendSuccess } from '../utils/response.util';

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

export const createBusinessSubscription = async (req: Request, res: Response) => {
  try {
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

    const subscription = await prismaClient.businessSubscription.create({
      data: {
        businessId,
        planId,
        status: 'ACTIVE',
        startedAt: startsAt,
        endsAt,
        price,
        discountAmount,
        totalAmount: effectivePrice,
        paymentReference,
        paymentProvider,
        notes,
        metadata: metadata ?? null,
        createdById: (req as any).user?.userId ?? null,
      },
    });

    await prismaClient.business.update({
      where: { id: businessId },
      data: {
        currentSubscriptionId: subscription.id,
        subscriptionStartedAt: startsAt,
        subscriptionExpiresAt: endsAt,
        canCreateAdvertisements: plan.allowAdvertisements,
        promotedUntil: plan.topPlacement ? endsAt : null,
        isVerified: plan.verifiedBadge ? true : business.isVerified,
      },
    });

    return sendSuccess(res, 201, 'Subscription created successfully', subscription);
  } catch (error) {
    console.error('Create business subscription error:', error);
    return sendError(res, 500, 'Failed to create subscription', error);
  }
};

export const getBusinessSubscriptions = async (req: Request, res: Response) => {
  try {
    const { businessId, status, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    const where: any = {};
    if (businessId) {
      where.businessId = businessId;
    }
    if (status) {
      where.status = status;
    }

    const [subscriptions, total] = await Promise.all([
      prismaClient.businessSubscription.findMany({
        where,
        include: {
          plan: true,
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

export const getBusinessSubscriptionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const subscription = await prismaClient.businessSubscription.findUnique({
      where: { id },
      include: {
        plan: true,
        business: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!subscription) {
      return sendError(res, 404, 'Subscription not found');
    }

    return sendSuccess(res, 200, 'Subscription fetched successfully', subscription);
  } catch (error) {
    console.error('Get subscription error:', error);
    return sendError(res, 500, 'Failed to fetch subscription', error);
  }
};

export const cancelBusinessSubscription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const subscription = await prismaClient.businessSubscription.findUnique({ where: { id } });
    if (!subscription) {
      return sendError(res, 404, 'Subscription not found');
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

    const business = await prismaClient.business.findUnique({ where: { id: subscription.businessId } });

    if (business?.currentSubscriptionId === id) {
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
      select: { id: true, businessId: true },
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

    await Promise.all(businessUpdates);

    return sendSuccess(res, 200, 'Expired subscriptions synced successfully', { processed: expired.length });
  } catch (error) {
    console.error('Sync expired subscriptions error:', error);
    return sendError(res, 500, 'Failed to sync expired subscriptions', error);
  }
};
