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

const parseIntValue = (value: any): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const createSubscriptionPlan = async (req: Request, res: Response) => {
  try {
    const {
      name,
      slug,
      description,
      price,
      salePrice,
      currency,
      status,
      billingInterval,
      intervalCount,
      customIntervalDays,
      verifiedBadge,
      topPlacement,
      allowAdvertisements,
      maxAdvertisements,
      couponCode,
      couponType,
      couponValue,
      couponMaxDiscount,
      couponStartsAt,
      couponEndsAt,
      couponUsageLimit,
      notes,
      metadata,
    } = req.body;

    if (!name || !slug) {
      return sendError(res, 400, 'Name and slug are required');
    }

    if (!price) {
      return sendError(res, 400, 'Price is required');
    }

    const plan = await prismaClient.subscriptionPlan.create({
      data: {
        name,
        slug,
        description,
        price: parseDecimal(price)!,
        salePrice: parseDecimal(salePrice),
        currency: currency || 'SAR',
        status,
        billingInterval,
        intervalCount: parseIntValue(intervalCount) ?? 1,
        customIntervalDays: parseIntValue(customIntervalDays),
        verifiedBadge: verifiedBadge === undefined ? false : verifiedBadge === true || verifiedBadge === 'true',
        topPlacement: topPlacement === undefined ? false : topPlacement === true || topPlacement === 'true',
        allowAdvertisements:
          allowAdvertisements === undefined ? false : allowAdvertisements === true || allowAdvertisements === 'true',
        maxAdvertisements: parseIntValue(maxAdvertisements),
        couponCode,
        couponType,
        couponValue: parseDecimal(couponValue),
        couponMaxDiscount: parseDecimal(couponMaxDiscount),
        couponStartsAt: couponStartsAt ? new Date(couponStartsAt) : undefined,
        couponEndsAt: couponEndsAt ? new Date(couponEndsAt) : undefined,
        couponUsageLimit: parseIntValue(couponUsageLimit),
        notes,
        metadata: metadata ?? null,
        createdById: (req as any).user?.userId ?? null,
      },
    });

    return sendSuccess(res, 201, 'Subscription plan created successfully', plan);
  } catch (error) {
    console.error('Create subscription plan error:', error);
    return sendError(res, 500, 'Failed to create subscription plan', error);
  }
};

export const updateSubscriptionPlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prismaClient.subscriptionPlan.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 404, 'Subscription plan not found');
    }

    const {
      name,
      slug,
      description,
      price,
      salePrice,
      currency,
      status,
      billingInterval,
      intervalCount,
      customIntervalDays,
      verifiedBadge,
      topPlacement,
      allowAdvertisements,
      maxAdvertisements,
      couponCode,
      couponType,
      couponValue,
      couponMaxDiscount,
      couponStartsAt,
      couponEndsAt,
      couponUsageLimit,
      notes,
      metadata,
    } = req.body;

    const plan = await prismaClient.subscriptionPlan.update({
      where: { id },
      data: {
        name,
        slug,
        description,
        price: price !== undefined ? parseDecimal(price) : undefined,
        salePrice: salePrice !== undefined ? parseDecimal(salePrice) : undefined,
        currency,
        status,
        billingInterval,
        intervalCount: intervalCount !== undefined ? parseIntValue(intervalCount) : undefined,
        customIntervalDays: customIntervalDays !== undefined ? parseIntValue(customIntervalDays) : undefined,
        verifiedBadge:
          verifiedBadge !== undefined ? verifiedBadge === true || verifiedBadge === 'true' : undefined,
        topPlacement: topPlacement !== undefined ? topPlacement === true || topPlacement === 'true' : undefined,
        allowAdvertisements:
          allowAdvertisements !== undefined
            ? allowAdvertisements === true || allowAdvertisements === 'true'
            : undefined,
        maxAdvertisements: maxAdvertisements !== undefined ? parseIntValue(maxAdvertisements) : undefined,
        couponCode,
        couponType,
        couponValue: couponValue !== undefined ? parseDecimal(couponValue) : undefined,
        couponMaxDiscount: couponMaxDiscount !== undefined ? parseDecimal(couponMaxDiscount) : undefined,
        couponStartsAt: couponStartsAt ? new Date(couponStartsAt) : couponStartsAt === null ? null : undefined,
        couponEndsAt: couponEndsAt ? new Date(couponEndsAt) : couponEndsAt === null ? null : undefined,
        couponUsageLimit: couponUsageLimit !== undefined ? parseIntValue(couponUsageLimit) : undefined,
        notes,
        metadata: metadata ?? undefined,
      },
    });

    return sendSuccess(res, 200, 'Subscription plan updated successfully', plan);
  } catch (error) {
    console.error('Update subscription plan error:', error);
    return sendError(res, 500, 'Failed to update subscription plan', error);
  }
};

export const getSubscriptionPlans = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', status } = req.query;
    const skip = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [plans, total] = await Promise.all([
      prismaClient.subscriptionPlan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string, 10),
      }),
      prismaClient.subscriptionPlan.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Subscription plans fetched successfully', {
      plans,
      pagination: {
        total,
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        totalPages: Math.ceil(total / parseInt(limit as string, 10)),
      },
    });
  } catch (error) {
    console.error('List subscription plans error:', error);
    return sendError(res, 500, 'Failed to fetch subscription plans', error);
  }
};

export const getSubscriptionPlanById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const plan = await prismaClient.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      return sendError(res, 404, 'Subscription plan not found');
    }

    return sendSuccess(res, 200, 'Subscription plan fetched successfully', plan);
  } catch (error) {
    console.error('Get subscription plan error:', error);
    return sendError(res, 500, 'Failed to fetch subscription plan', error);
  }
};

export const archiveSubscriptionPlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prismaClient.subscriptionPlan.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 404, 'Subscription plan not found');
    }

    const plan = await prismaClient.subscriptionPlan.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    return sendSuccess(res, 200, 'Subscription plan archived successfully', plan);
  } catch (error) {
    console.error('Archive subscription plan error:', error);
    return sendError(res, 500, 'Failed to archive subscription plan', error);
  }
};
