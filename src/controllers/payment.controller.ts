import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';
import { paytabsService } from '../utils/paytabs.util';
import { paytabsConfig } from '../config/paytabs';

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

export const getBusinessPayments = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

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

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
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
        skip,
        take: parseInt(limit as string, 10),
      }),
      prisma.payment.count({ where: { businessId } }),
    ]);

    return sendSuccess(res, 200, 'Business payments fetched successfully', {
      payments,
      pagination: {
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        total,
        pages: Math.ceil(total / parseInt(limit as string, 10)),
      },
    });
  } catch (error) {
    console.error('Get business payments error:', error);
    return sendError(res, 500, 'Failed to fetch business payments', error);
  }
};

// Create payment with PayTabs integration
export const createPayment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { businessId, amount, currency, description } = req.body;

    if (!businessId || !amount) {
      return sendError(res, 400, 'Business ID and amount are required');
    }

    // Validate amount
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return sendError(res, 400, 'Invalid payment amount');
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
      },
    });

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    // Check if business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    // Create payment record in database (PENDING status)
    const payment = await prisma.payment.create({
      data: {
        userId: userId!,
        businessId,
        amount: paymentAmount,
        currency: currency || paytabsConfig.currency || 'SAR',
        status: 'PENDING',
        description: description || `Payment for ${business.name}`,
        paymentMethod: 'PAYTABS',
      },
    });

    // Create PayTabs payment page
    try {
      const paytabsResponse = await paytabsService.createPaymentPage(
        paymentAmount,
        payment.currency,
        payment.id, // Use our payment ID as cart_id
        payment.description || `Payment for ${business.name}`,
        {
          name: `${user.firstName} ${user.lastName}`.trim() || user.email,
          email: user.email,
          phone: user.phone || '966500000000',
          street1: 'Riyadh',
          city: 'Riyadh',
          state: 'Riyadh',
          country: 'SA',
          zip: '11564',
        },
        paytabsConfig.callbackUrl,
        paytabsConfig.returnUrl // enforce backend return URL to avoid misconfiguration/405s
      );

      // Update payment with PayTabs transaction reference
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          transactionId: paytabsResponse.tran_ref,
        },
      });

      return sendSuccess(res, 201, 'Payment page created successfully', {
        paymentId: payment.id,
        redirectUrl: paytabsResponse.redirect_url,
        transactionRef: paytabsResponse.tran_ref,
      });
    } catch (paytabsError: any) {
      // If PayTabs fails, mark payment as failed
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      console.error('PayTabs error:', paytabsError);
      console.error('PayTabs error details:', JSON.stringify({
        message: paytabsError?.message,
        response: paytabsError?.response?.data,
        status: paytabsError?.response?.status,
        stack: paytabsError?.stack,
      }, null, 2));
      
      // Extract more detailed error message
      let errorMessage = 'Failed to create payment page with PayTabs';
      if (paytabsError?.response?.data?.message) {
        errorMessage = paytabsError.response.data.message;
      } else if (paytabsError?.message) {
        errorMessage = paytabsError.message;
      } else if (paytabsError?.response?.data?.error) {
        errorMessage = paytabsError.response.data.error;
      } else if (paytabsError?.response?.data) {
        errorMessage = JSON.stringify(paytabsError.response.data);
      }
      
      return sendError(res, 500, errorMessage);
    }
  } catch (error: any) {
    console.error('Create payment error:', error);
    const errorMessage = error?.message || error?.response?.data?.message || 'Failed to create payment';
    return sendError(res, 500, errorMessage, error);
  }
};

// PayTabs Callback Handler
export const handlePayTabsCallback = async (req: Request, res: Response) => {
  try {
    const callbackData = req.body;
    
    console.log('PayTabs Callback received:', JSON.stringify(callbackData, null, 2));

    const {
      tran_ref,
      cart_id,
      payment_result,
      cart_amount,
      cart_currency,
    } = callbackData;

    if (!tran_ref || !cart_id) {
      return sendError(res, 400, 'Invalid callback data: missing tran_ref or cart_id');
    }

    // Verify payment with PayTabs API
    const verificationResult = await paytabsService.verifyPayment(tran_ref);
    
    // Parse payment status
    const paymentStatus = paytabsService.parsePaymentStatus(
      verificationResult.payment_result?.response_status || payment_result?.response_status
    );

    // Find the payment in our database using cart_id (which is our payment ID)
    const payment = await prisma.payment.findUnique({
      where: { id: cart_id },
      include: {
        business: true,
      },
    });

    if (!payment) {
      console.error(`Payment not found for cart_id: ${cart_id}`);
      return sendError(res, 404, 'Payment not found');
    }

    // IDEMPOTENCY CHECK: If payment is already COMPLETED, skip processing
    // PayTabs can and will retry callbacks, so we must guard against duplicate processing
    if (payment.status === 'COMPLETED') {
      console.log(`Payment ${payment.id} already processed`);
      return sendSuccess(res, 200, 'Already processed');
    }

    // Update payment record
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: paymentStatus,
        transactionId: tran_ref,
      },
    });

    // IMPORTANT: Only activate subscription if payment is COMPLETED
    // This is the ONLY place where subscriptions should be activated
    if (paymentStatus === 'COMPLETED') {
      // Check if there's a pending subscription for this business
      const pendingSubscription = await (prisma as any).businessSubscription.findFirst({
        where: {
          businessId: payment.businessId,
          status: 'PENDING',
        },
        include: {
          plan: true,
          business: {
            select: {
              id: true,
              name: true,
              userId: true,
              isVerified: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (pendingSubscription) {
        console.log(`Activating subscription ${pendingSubscription.id} for business ${payment.businessId} after successful payment`);
        
        // Activate the subscription
        await (prisma as any).businessSubscription.update({
          where: { id: pendingSubscription.id },
          data: {
            status: 'ACTIVE',
            paymentReference: tran_ref,
            paymentProvider: 'PAYTABS',
          },
        });

        // Update business with subscription benefits
        await prisma.business.update({
          where: { id: payment.businessId },
          data: {
            currentSubscriptionId: pendingSubscription.id,
            subscriptionStartedAt: pendingSubscription.startedAt,
            subscriptionExpiresAt: pendingSubscription.endsAt,
            canCreateAdvertisements: pendingSubscription.plan.allowAdvertisements,
            promotedUntil: pendingSubscription.plan.topPlacement ? pendingSubscription.endsAt : null,
            isVerified: pendingSubscription.plan.verifiedBadge ? true : pendingSubscription.business.isVerified,
          },
        });

        // Create notification for subscription activation
        await prisma.notification.create({
          data: {
            userId: pendingSubscription.business.userId,
            type: 'SUBSCRIPTION_ACTIVATED',
            title: 'Subscription Activated! 🎉',
            message: `Your subscription to "${pendingSubscription.plan.name}" for "${pendingSubscription.business.name}" has been activated. ${pendingSubscription.plan.topPlacement ? 'Your business is now featured at the top of listings!' : ''} ${pendingSubscription.plan.verifiedBadge ? 'Your business is now verified!' : ''}`,
            link: `/dashboard/subscriptions`,
          },
        });
      }
    } else {
      // Payment failed or is pending - do NOT activate subscription
      console.log(`Payment ${payment.id} status is ${paymentStatus} - subscription will NOT be activated`);
      
      // Optionally, mark any pending subscriptions as failed if payment failed
      if (paymentStatus === 'FAILED') {
        const pendingSubscription = await (prisma as any).businessSubscription.findFirst({
          where: {
            businessId: payment.businessId,
            status: 'PENDING',
          },
          orderBy: {
            createdAt: 'desc',
          },
        });
        
        if (pendingSubscription) {
          console.log(`Marking subscription ${pendingSubscription.id} as FAILED due to payment failure`);
          await (prisma as any).businessSubscription.update({
            where: { id: pendingSubscription.id },
            data: {
              status: 'FAILED',
            },
          });
        }
      }
    }

    return sendSuccess(res, 200, 'Payment callback processed successfully', {
      paymentId: payment.id,
      status: paymentStatus,
      transactionRef: tran_ref,
    });
  } catch (error) {
    console.error('PayTabs callback error:', error);
    return sendError(res, 500, 'Failed to process payment callback', error);
  }
};

// PayTabs Return Handler (for redirecting user after payment)
// IMPORTANT: Do NOT verify, do NOT update DB, do NOT activate anything here
// Only redirect internally to the intermediate redirect endpoint
export const handlePayTabsReturn = async (req: Request, res: Response) => {
  try {
    console.log('PayTabs Return Handler - Method:', req.method);
    console.log('PayTabs Return Handler - Query:', req.query);
    console.log('PayTabs Return Handler - Body:', req.body);

    const tranRef =
      (req.body?.tranRef as string) ||
      (req.body?.tran_ref as string) ||
      (req.query?.tranRef as string) ||
      (req.query?.tran_ref as string);

    const cartId =
      (req.body?.cartId as string) ||
      (req.body?.cart_id as string) ||
      (req.query?.cartId as string) ||
      (req.query?.cart_id as string);

    if (!tranRef || !cartId) {
      console.error('Return handler missing parameters', { tranRef, cartId });
      return res.redirect(303, `/api/payments/paytabs/redirect?error=invalid_params`);
    }

    console.log('Return handler received:', { tranRef, cartId });

    // IMPORTANT
    // Do NOT verify, do NOT update DB, do NOT activate anything here
    // Only redirect internally

    return res.redirect(
      303,
      `/api/payments/paytabs/redirect?paymentId=${cartId}&tranRef=${tranRef}`
    );
  } catch (error) {
    console.error('PayTabs return error:', error);
    return res.redirect(303, `/api/payments/paytabs/redirect?error=exception`);
  }
};

// PayTabs Redirect Handler (GET endpoint for two-step redirect)
// This endpoint reads payment status from DB and redirects to frontend.
// This solves cross-origin POST redirect issues by using GET redirect.
export const handlePayTabsRedirect = async (req: Request, res: Response) => {
  const { paymentId, tranRef, error } = req.query;

  const frontendBase =
    process.env.FRONTEND_URL || 'https://mawjoodfrontend.vercel.app';

  if (error || !paymentId) {
    return res.redirect(`${frontendBase}/dashboard/payments/failed`);
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId as string },
  });

  if (!payment) {
    return res.redirect(`${frontendBase}/dashboard/payments/failed`);
  }

  if (payment.status === 'COMPLETED') {
    return res.redirect(
      `${frontendBase}/dashboard/payments/success?paymentId=${paymentId}&tranRef=${tranRef}`
    );
  }

  if (payment.status === 'FAILED') {
    return res.redirect(
      `${frontendBase}/dashboard/payments/failed?paymentId=${paymentId}&tranRef=${tranRef}`
    );
  }

  return res.redirect(
    `${frontendBase}/dashboard/payments/pending?paymentId=${paymentId}&tranRef=${tranRef}`
  );
};

// Update payment status (for webhook/callback from PayTabs)
export const updatePaymentStatus = async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const { status, transactionId } = req.body;

    if (!status) {
      return sendError(res, 400, 'Status is required');
    }

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
    const { page = '1', limit = '10', status, startDate, endDate } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};

    if (status) {
      where.status = status;
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