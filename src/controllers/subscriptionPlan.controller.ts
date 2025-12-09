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
      isSponsorPlan,
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

    const existingPlan = await prismaClient.subscriptionPlan.findUnique({
      where: { slug },
      select: { id: true, name: true, isSponsorPlan: true },
    });

    if (existingPlan) {
      return sendError(res, 400, `A plan with slug "${slug}" already exists. Please use a different slug.`);
    }

    const isSponsor = isSponsorPlan === true || isSponsorPlan === 'true';
    
    if (!isSponsor && (price === undefined || price === null || price === '')) {
      return sendError(res, 400, 'Price is required for non-sponsor plans');
    }

    const finalPrice = isSponsor && (price === undefined || price === null || price === '') 
      ? new Prisma.Decimal(0) 
      : parseDecimal(price) || new Prisma.Decimal(0);

    let hasSponsorPlanColumn = false;
    try {
      const result = await prismaClient.$queryRaw<Array<{ COLUMN_NAME: string }>>`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'SubscriptionPlan' 
        AND COLUMN_NAME = 'isSponsorPlan'
      `;
      hasSponsorPlanColumn = result.length > 0;
    } catch (error) {
      hasSponsorPlanColumn = false;
    }

    const planData: any = {
      name,
      slug,
      description,
      price: finalPrice,
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
    };

    // Only include isSponsorPlan if column exists
    if (hasSponsorPlanColumn) {
      planData.isSponsorPlan = isSponsorPlan === undefined ? false : isSponsorPlan === true || isSponsorPlan === 'true';
    }

    const plan = await prismaClient.subscriptionPlan.create({
      data: planData,
    });

    return sendSuccess(res, 201, 'Subscription plan created successfully', plan);
  } catch (error: any) {
    console.error('Create subscription plan error:', error);
    
    // Handle unique constraint violation (duplicate slug)
    if (error.code === 'P2002' && error.meta?.target?.includes('slug')) {
      return sendError(res, 400, `A plan with slug "${req.body.slug}" already exists. Please use a different slug.`);
    }
    
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
      isSponsorPlan,
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
        isSponsorPlan:
          isSponsorPlan !== undefined ? isSponsorPlan === true || isSponsorPlan === 'true' : undefined,
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
    const { page = '1', limit = '20', status, includeSponsor } = req.query;
    const skip = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    const userRole = (req as any).user?.role;

    const where: any = {};
    
    // Check if isSponsorPlan column exists before filtering
    let hasSponsorPlanColumn = false;
    try {
      // Use raw SQL to check if column exists
      const result = await prismaClient.$queryRaw<Array<{ COLUMN_NAME: string }>>`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'SubscriptionPlan' 
        AND COLUMN_NAME = 'isSponsorPlan'
      `;
      hasSponsorPlanColumn = result.length > 0;
      console.log('isSponsorPlan column exists:', hasSponsorPlanColumn);
    } catch (error) {
      hasSponsorPlanColumn = false;
      console.warn('Could not check for isSponsorPlan column - migration may not be applied yet');
    }
    
    // Filter logic: Only hide sponsor plans if:
    // 1. Column exists AND user is not admin (non-admins never see sponsor plans)
    // 2. Column exists AND user is admin BUT explicitly requested to exclude (includeSponsor === 'false')
    // Otherwise, show all plans (including sponsor plans for admins)
    if (hasSponsorPlanColumn) {
      if (userRole !== 'ADMIN') {
        // Non-admins never see sponsor plans
        where.isSponsorPlan = false;
        console.log('Filtering: Non-admin user - hiding sponsor plans');
      } else if (includeSponsor === 'false') {
        // Admin explicitly requested to exclude sponsor plans
        where.isSponsorPlan = false;
        console.log('Filtering: Admin requested to exclude sponsor plans');
      } else {
        // Admin and includeSponsor is not 'false' - show all plans (no filter)
        console.log('Filtering: Admin - showing all plans including sponsor plans');
      }
    } else {
      console.log('Filtering: Column does not exist - showing all plans');
    }
    
    if (status) {
      where.status = status;
    }

    console.log('Where clause:', JSON.stringify(where, null, 2));

    let plans: any[];
    let total: number;

    try {
      // Try normal Prisma query
      [plans, total] = await Promise.all([
        prismaClient.subscriptionPlan.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string, 10),
        }),
        prismaClient.subscriptionPlan.count({ where }),
      ]);
      
      console.log(`Found ${plans.length} plans, ${plans.filter((p: any) => p.isSponsorPlan).length} are sponsor plans`);
    } catch (error: any) {
      // If column doesn't exist, use raw SQL without isSponsorPlan
      if (error.code === 'P2022' && error.meta?.column?.includes('isSponsorPlan')) {
        console.log('Column error detected, using raw SQL fallback');
        const statusFilter = status ? `AND status = '${status}'` : '';
        const limitVal = parseInt(limit as string, 10);
        const offsetVal = skip;

        plans = await prismaClient.$queryRawUnsafe(`
          SELECT id, name, slug, description, price, salePrice, currency, status, 
                 billingInterval, intervalCount, customIntervalDays, 
                 verifiedBadge, topPlacement, allowAdvertisements, maxAdvertisements,
                 couponCode, couponType, couponValue, couponMaxDiscount, 
                 couponStartsAt, couponEndsAt, couponUsageLimit, notes, metadata, 
                 createdById, createdAt, updatedAt
          FROM SubscriptionPlan 
          WHERE 1=1 ${statusFilter}
          ORDER BY createdAt DESC 
          LIMIT ${limitVal} OFFSET ${offsetVal}
        `);

        const countResult = await prismaClient.$queryRawUnsafe(`
          SELECT COUNT(*) as count FROM SubscriptionPlan WHERE 1=1 ${statusFilter}
        `) as Array<{ count: bigint }>;
        total = Number(countResult[0]?.count || 0);

        // Add default isSponsorPlan = false to all plans for compatibility
        plans = plans.map((plan: any) => ({ ...plan, isSponsorPlan: false }));
      } else {
        throw error;
      }
    }

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
