import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';

// Get user payments
export const getUserPayments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const payments = await prisma.payment.findMany({
      where: { userId },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Payments fetched successfully', payments);
  } catch (error) {
    console.error('Get payments error:', error);
    return sendError(res, 500, 'Failed to fetch payments', error);
  }
};

// Get business payments (for business owner)
export const getBusinessPayments = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    // Check if user owns the business or is admin
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    if (business.userId !== userId && userRole !== 'ADMIN') {
      return sendError(res, 403, 'You are not authorized to view these payments');
    }

    const payments = await prisma.payment.findMany({
      where: { businessId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Business payments fetched successfully', payments);
  } catch (error) {
    console.error('Get business payments error:', error);
    return sendError(res, 500, 'Failed to fetch business payments', error);
  }
};

// Create payment (Placeholder - will integrate PayTabs later)
export const createPayment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { businessId, amount, currency, description } = req.body;

    if (!businessId || !amount) {
      return sendError(res, 400, 'Business ID and amount are required');
    }

    // Check if business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    // TODO: Integrate PayTabs payment gateway here
    // For now, create a pending payment record
    const payment = await prisma.payment.create({
      data: {
        userId: userId!,
        businessId,
        amount: parseFloat(amount),
        currency: currency || 'SAR',
        status: 'PENDING',
        description,
        paymentMethod: 'PAYTABS', // Placeholder
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return sendSuccess(res, 201, 'Payment initiated (PayTabs integration pending)', payment);
  } catch (error) {
    console.error('Create payment error:', error);
    return sendError(res, 500, 'Failed to create payment', error);
  }
};

// Update payment status (for webhook/callback from PayTabs)
export const updatePaymentStatus = async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const { status, transactionId } = req.body;

    if (!status) {
      return sendError(res, 400, 'Status is required');
    }

    // TODO: Verify webhook signature from PayTabs

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        transactionId,
      },
    });

    return sendSuccess(res, 200, 'Payment status updated successfully', payment);
  } catch (error) {
    console.error('Update payment error:', error);
    return sendError(res, 500, 'Failed to update payment status', error);
  }
};

// Get payment by ID
export const getPaymentById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        business: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!payment) {
      return sendError(res, 404, 'Payment not found');
    }

    // Check authorization
    if (payment.userId !== userId && userRole !== 'ADMIN') {
      return sendError(res, 403, 'You are not authorized to view this payment');
    }

    return sendSuccess(res, 200, 'Payment fetched successfully', payment);
  } catch (error) {
    console.error('Get payment error:', error);
    return sendError(res, 500, 'Failed to fetch payment', error);
  }
};

// Get all payments (Admin only)
export const getAllPayments = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '10', status } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = status ? { status } : {};

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          business: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payment.count({ where }),
    ]);

    return sendSuccess(res, 200, 'All payments fetched successfully', {
      payments,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get all payments error:', error);
    return sendError(res, 500, 'Failed to fetch payments', error);
  }
};