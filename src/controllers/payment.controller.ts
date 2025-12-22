import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';
import { paytabsService } from '../utils/paytabs.util';
import { paytabsConfig } from '../config/paytabs';
import { emailService } from '../services/email.service';

// Get user payments
export const getUserPayments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { page = '1', limit = '20', businessId } = req.query;
    const skip = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    const where: any = { userId };
    
    // Optionally filter by businessId
    if (businessId) {
      where.businessId = businessId as string;
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
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
        skip,
        take: parseInt(limit as string, 10),
      }),
      prisma.payment.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Payments fetched successfully', {
      payments,
      pagination: {
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        total,
        pages: Math.ceil(total / parseInt(limit as string, 10)),
      },
    });
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
          name: `${user.firstName} ${user.lastName}`.trim() || user.email || 'Customer',
          email: user.email || 'customer@mawjood.com',
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
  const startTime = Date.now();
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔄 [CALLBACK] PayTabs Callback Handler STARTED');
  console.log('🕐 [CALLBACK] Timestamp:', new Date().toISOString());
  console.log('📥 [CALLBACK] Method:', req.method);
  console.log('📥 [CALLBACK] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('📥 [CALLBACK] Query:', JSON.stringify(req.query, null, 2));
  console.log('📥 [CALLBACK] Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const callbackData = req.body;
    
    console.log('📦 [CALLBACK] Parsed callback data:', JSON.stringify(callbackData, null, 2));

    const {
      tran_ref,
      cart_id,
      payment_result,
      cart_amount,
      cart_currency,
    } = callbackData;
    
    console.log('🔍 [CALLBACK] Extracted values:', {
      tran_ref,
      cart_id,
      payment_result: payment_result ? JSON.stringify(payment_result) : null,
      cart_amount,
      cart_currency,
    });

    if (!tran_ref || !cart_id) {
      console.error('❌ [CALLBACK] Missing required fields:', { tran_ref, cart_id });
      return sendError(res, 400, 'Invalid callback data: missing tran_ref or cart_id');
    }

    console.log('✅ [CALLBACK] Required fields present, proceeding with verification...');

    // Verify payment with PayTabs API
    console.log('🔐 [CALLBACK] Verifying payment with PayTabs API for tran_ref:', tran_ref);
    const verificationResult = await paytabsService.verifyPayment(tran_ref);
    console.log('✅ [CALLBACK] PayTabs verification result:', JSON.stringify(verificationResult, null, 2));
    
    // Parse payment status
    const paymentStatus = paytabsService.parsePaymentStatus(
      verificationResult.payment_result?.response_status || payment_result?.response_status
    );
    console.log('📊 [CALLBACK] Parsed payment status:', paymentStatus);

    // Find the payment in our database using cart_id (which is our payment ID)
    console.log('🔍 [CALLBACK] Looking up payment in database with cart_id:', cart_id);
    const payment = await prisma.payment.findUnique({
      where: { id: cart_id },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
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
      console.error(`❌ [CALLBACK] Payment not found for cart_id: ${cart_id}`);
      return sendError(res, 404, 'Payment not found');
    }
    
    console.log('✅ [CALLBACK] Payment found:', {
      id: payment.id,
      currentStatus: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      businessId: payment.businessId,
    });

    // IDEMPOTENCY CHECK: If payment is already COMPLETED, skip processing
    // PayTabs can and will retry callbacks, so we must guard against duplicate processing
    if (payment.status === 'COMPLETED') {
      console.log(`⚠️ [CALLBACK] Payment ${payment.id} already processed (status: ${payment.status}), skipping`);
      return sendSuccess(res, 200, 'Already processed');
    }

    console.log(`🔄 [CALLBACK] Updating payment ${payment.id} from status "${payment.status}" to "${paymentStatus}"`);
    
    // Update payment record
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: paymentStatus,
        transactionId: tran_ref,
      },
    });
    
    console.log('✅ [CALLBACK] Payment updated successfully:', {
      id: updatedPayment.id,
      newStatus: updatedPayment.status,
      transactionId: updatedPayment.transactionId,
    });

    // Create notification based on payment status
    try {
      if (paymentStatus === 'COMPLETED') {
        await prisma.notification.create({
          data: {
            userId: payment.userId,
            type: 'PAYMENT_SUCCESS',
            title: 'Payment Successful! ✅',
            message: `Your payment of ${payment.amount} ${payment.currency} for "${payment.business?.name || 'business'}" has been completed successfully. Transaction ID: ${tran_ref}`,
            link: `/payments/success?paymentId=${payment.id}&tranRef=${tran_ref}`,
          },
        });
      } else if (paymentStatus === 'FAILED') {
        await prisma.notification.create({
          data: {
            userId: payment.userId,
            type: 'PAYMENT_FAILED',
            title: 'Payment Failed ❌',
            message: `Your payment of ${payment.amount} ${payment.currency} for "${payment.business?.name || 'business'}" has failed. Please try again or contact support if the issue persists.`,
            link: `/payments/failed?paymentId=${payment.id}&tranRef=${tran_ref}`,
          },
        });
      }
    } catch (notificationError) {
      // Don't fail the payment processing if notification creation fails
      console.error('Failed to create payment notification:', notificationError);
    }

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

        // Send email notification with transaction and plan details
        if (payment.user?.email) {
          try {
            const startDate = new Date(pendingSubscription.startedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            const endDate = new Date(pendingSubscription.endsAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });

            const planFeatures = [];
            if (pendingSubscription.plan.topPlacement) {
              planFeatures.push('Top Placement in Listings');
            }
            if (pendingSubscription.plan.verifiedBadge) {
              planFeatures.push('Verified Badge');
            }
            if (pendingSubscription.plan.allowAdvertisements) {
              planFeatures.push('Advertisement Creation');
            }
            if (pendingSubscription.plan.prioritySupport) {
              planFeatures.push('Priority Support');
            }

            const html = `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Payment Successful - Subscription Activated</title>
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background: linear-gradient(135deg, #1c4233 0%, #245240 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0;">Payment Successful! ✅</h1>
                  </div>
                  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #1c4233; margin-top: 0;">Thank You for Your Payment</h2>
                    <p>Hello ${payment.user.firstName || 'Valued Customer'},</p>
                    <p>We're excited to confirm that your payment has been processed successfully and your subscription has been activated!</p>
                    
                    <!-- Transaction Details -->
                    <div style="background: white; border-left: 4px solid #22c55e; padding: 20px; margin: 20px 0; border-radius: 5px;">
                      <h3 style="color: #1c4233; margin-top: 0;">Transaction Details</h3>
                      <p style="margin: 8px 0;"><strong>Transaction ID:</strong> ${tran_ref}</p>
                      <p style="margin: 8px 0;"><strong>Payment Amount:</strong> ${payment.amount} ${payment.currency}</p>
                      <p style="margin: 8px 0;"><strong>Payment Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      <p style="margin: 8px 0;"><strong>Payment Method:</strong> PayTabs</p>
                      <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #22c55e; font-weight: bold;">Completed</span></p>
                    </div>

                    <!-- Subscription Details -->
                    <div style="background: white; border-left: 4px solid #1c4233; padding: 20px; margin: 20px 0; border-radius: 5px;">
                      <h3 style="color: #1c4233; margin-top: 0;">Subscription Details</h3>
                      <p style="margin: 8px 0;"><strong>Business:</strong> ${pendingSubscription.business.name}</p>
                      <p style="margin: 8px 0;"><strong>Plan Name:</strong> ${pendingSubscription.plan.name}</p>
                      <p style="margin: 8px 0;"><strong>Start Date:</strong> ${startDate}</p>
                      <p style="margin: 8px 0;"><strong>End Date:</strong> ${endDate}</p>
                      ${planFeatures.length > 0 ? `
                        <div style="margin-top: 15px;">
                          <strong>Plan Features:</strong>
                          <ul style="margin: 10px 0; padding-left: 20px;">
                            ${planFeatures.map(feature => `<li style="margin: 5px 0;">${feature}</li>`).join('')}
                          </ul>
                        </div>
                      ` : ''}
                    </div>

                    <div style="background: #e0f2fe; border: 1px solid #0ea5e9; padding: 15px; margin: 20px 0; border-radius: 5px;">
                      <p style="margin: 0; color: #0c4a6e;"><strong>🎉 Your subscription is now active!</strong></p>
                      <p style="margin: 10px 0 0 0; color: #0c4a6e;">${pendingSubscription.plan.topPlacement ? 'Your business is now featured at the top of listings!' : ''} ${pendingSubscription.plan.verifiedBadge ? 'Your business is now verified with a verified badge!' : ''}</p>
                    </div>

                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${process.env.FRONTEND_URL || 'https://mawjood.com'}/dashboard/subscriptions" 
                         style="background: #1c4233; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                        View Subscription Details
                      </a>
                    </div>

                    <p>If you have any questions about your subscription or payment, please don't hesitate to contact our support team.</p>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                    <p style="color: #666; font-size: 12px; margin: 0;">This is an automated message, please do not reply.</p>
                  </div>
                </body>
              </html>
            `;

            await emailService.sendEmail({
              to: payment.user.email,
              subject: `Payment Successful - ${pendingSubscription.plan.name} Subscription Activated`,
              html,
            });

            console.log(`✅ Payment success email sent to ${payment.user.email}`);
          } catch (emailError) {
            // Don't fail the payment processing if email fails
            console.error('Failed to send payment success email:', emailError);
          }
        }
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

    const duration = Date.now() - startTime;
    console.log(`✅ [CALLBACK] Payment callback processed successfully in ${duration}ms`);
    console.log('📤 [CALLBACK] Sending success response:', {
      paymentId: payment.id,
      status: paymentStatus,
      transactionRef: tran_ref,
    });
    console.log('═══════════════════════════════════════════════════════');
    
    return sendSuccess(res, 200, 'Payment callback processed successfully', {
      paymentId: payment.id,
      status: paymentStatus,
      transactionRef: tran_ref,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ [CALLBACK] PayTabs callback error after', duration, 'ms:', error);
    console.error('❌ [CALLBACK] Error stack:', error?.stack);
    console.error('❌ [CALLBACK] Error details:', JSON.stringify({
      message: error?.message,
      response: error?.response?.data,
      status: error?.response?.status,
    }, null, 2));
    console.log('═══════════════════════════════════════════════════════');
    return sendError(res, 500, 'Failed to process payment callback', error);
  }
};

// PayTabs Return Handler (for redirecting user after payment)
// IMPORTANT: Do NOT verify, do NOT update DB, do NOT activate anything here
// Only redirect internally to the intermediate redirect endpoint
export const handlePayTabsReturn = async (req: Request, res: Response) => {
  const startTime = Date.now();
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔄 [RETURN] PayTabs Return Handler STARTED');
  console.log('🕐 [RETURN] Timestamp:', new Date().toISOString());
  console.log('📥 [RETURN] Method:', req.method);
  console.log('📥 [RETURN] URL:', req.url);
  console.log('📥 [RETURN] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('📥 [RETURN] Query params:', JSON.stringify(req.query, null, 2));
  console.log('📥 [RETURN] Body:', JSON.stringify(req.body, null, 2));
  console.log('📥 [RETURN] Body type:', typeof req.body);
  console.log('📥 [RETURN] Body keys:', req.body ? Object.keys(req.body) : 'no body');
  
  try {
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

    console.log('🔍 [RETURN] Extracted values:', {
      tranRef,
      cartId,
      sources: {
        tranRefFromBody: req.body?.tranRef || req.body?.tran_ref,
        tranRefFromQuery: req.query?.tranRef || req.query?.tran_ref,
        cartIdFromBody: req.body?.cartId || req.body?.cart_id,
        cartIdFromQuery: req.query?.cartId || req.query?.cart_id,
      },
    });

    if (!tranRef || !cartId) {
      console.error('❌ [RETURN] Missing required parameters:', { tranRef, cartId });
      console.log('═══════════════════════════════════════════════════════');
      return res.redirect(303, `/api/payments/paytabs/redirect?error=invalid_params`);
    }

    console.log('✅ [RETURN] All parameters present, proceeding with redirect...');



    const redirectUrl = `/api/payments/paytabs/redirect?paymentId=${cartId}&tranRef=${tranRef}`;
    console.log('🔄 [RETURN] Redirecting to:', redirectUrl);
    console.log('═══════════════════════════════════════════════════════');

    return res.redirect(303, redirectUrl);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ [RETURN] PayTabs return error after', duration, 'ms:', error);
    console.error('❌ [RETURN] Error stack:', error?.stack);
    console.log('═══════════════════════════════════════════════════════');
    return res.redirect(303, `/api/payments/paytabs/redirect?error=exception`);
  }
};

// PayTabs Redirect Handler (GET endpoint for two-step redirect)
// This endpoint reads payment status from DB and redirects to frontend.
// This solves cross-origin POST redirect issues by using GET redirect.
export const handlePayTabsRedirect = async (req: Request, res: Response) => {
  const startTime = Date.now();
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔄 [REDIRECT] PayTabs Redirect Handler STARTED');
  console.log('🕐 [REDIRECT] Timestamp:', new Date().toISOString());
  console.log('📥 [REDIRECT] Method:', req.method);
  console.log('📥 [REDIRECT] URL:', req.url);
  console.log('📥 [REDIRECT] Query params:', JSON.stringify(req.query, null, 2));
  console.log('📥 [REDIRECT] Headers:', JSON.stringify(req.headers, null, 2));
  
  const { paymentId, tranRef, error } = req.query;
  
  console.log('🔍 [REDIRECT] Extracted query params:', {
    paymentId,
    tranRef,
    error,
  });

  const frontendBase =
    process.env.FRONTEND_URL || 'https://mawjoodfrontend.vercel.app';
  
  console.log('🌐 [REDIRECT] Frontend base URL:', frontendBase);
  console.log('🌐 [REDIRECT] FRONTEND_URL env var:', process.env.FRONTEND_URL || 'NOT SET (using default)');
  
  if (!process.env.FRONTEND_URL) {
    console.warn('⚠️ [REDIRECT] WARNING: FRONTEND_URL environment variable is not set!');
    console.warn('⚠️ [REDIRECT] Using default:', frontendBase);
    console.warn('⚠️ [REDIRECT] This may cause redirect issues. Please set FRONTEND_URL in your environment.');
  }

  if (error || !paymentId) {
    console.error('❌ [REDIRECT] Error or missing paymentId:', { error, paymentId });
    const failedUrl = `${frontendBase}/payments/failed`;
    console.log('🔄 [REDIRECT] Redirecting to failed page (no paymentId):', failedUrl);
    console.log('═══════════════════════════════════════════════════════');
    return res.redirect(302, failedUrl);
  }

  console.log('🔍 [REDIRECT] Looking up payment in database with ID:', paymentId);
  
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId as string },
    });

    if (!payment) {
      console.error('❌ [REDIRECT] Payment not found in database for ID:', paymentId);
      const failedUrl = `${frontendBase}/payments/failed`;
      console.log('🔄 [REDIRECT] Redirecting to failed page (payment not found):', failedUrl);
      console.log('═══════════════════════════════════════════════════════');
      return res.redirect(302, failedUrl);
    }

    console.log('✅ [REDIRECT] Payment found:', {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      transactionId: payment.transactionId,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    });

    // If payment is still PENDING, callback might not have processed yet
    // Wait a bit and check again, or verify with PayTabs directly
    let finalPayment = payment;
    if (payment.status === 'PENDING' && tranRef) {
      console.log('⏳ [REDIRECT] Payment status is PENDING, waiting for callback to process...');
      
      // Wait up to 3 seconds, checking every 500ms for updated status
      for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const refreshedPayment = await prisma.payment.findUnique({
          where: { id: paymentId as string },
        });
        
        if (refreshedPayment && refreshedPayment.status !== 'PENDING') {
          console.log(`✅ [REDIRECT] Payment status updated after ${(i + 1) * 500}ms:`, refreshedPayment.status);
          finalPayment = refreshedPayment;
          break;
        }
      }
      
      // If still PENDING, try to verify with PayTabs API
      if (finalPayment.status === 'PENDING' && tranRef) {
        console.log('🔐 [REDIRECT] Still PENDING, verifying with PayTabs API...');
        try {
          const verificationResult = await paytabsService.verifyPayment(tranRef as string);
          const paymentStatus = paytabsService.parsePaymentStatus(
            verificationResult.payment_result?.response_status
          );
          
          if (paymentStatus !== 'PENDING') {
            console.log('✅ [REDIRECT] PayTabs API returned status:', paymentStatus);
            // Update payment in database
            finalPayment = await prisma.payment.update({
              where: { id: paymentId as string },
              data: {
                status: paymentStatus,
                transactionId: tranRef as string,
              },
            });
            console.log('✅ [REDIRECT] Payment updated in database with status:', paymentStatus);
          }
        } catch (verifyError: any) {
          console.error('❌ [REDIRECT] Error verifying with PayTabs:', verifyError?.message);
        }
      }
    }

    let redirectUrl: string;
    
    if (finalPayment.status === 'COMPLETED') {
      redirectUrl = `${frontendBase}/payments/success?paymentId=${paymentId}&tranRef=${tranRef || finalPayment.transactionId || ''}`;
      console.log('✅ [REDIRECT] Payment status is COMPLETED, redirecting to success page');
    } else if (finalPayment.status === 'FAILED') {
      redirectUrl = `${frontendBase}/payments/failed?paymentId=${paymentId}&tranRef=${tranRef || finalPayment.transactionId || ''}`;
      console.log('❌ [REDIRECT] Payment status is FAILED, redirecting to failed page');
    } else {
      redirectUrl = `${frontendBase}/payments/pending?paymentId=${paymentId}&tranRef=${tranRef || finalPayment.transactionId || ''}`;
      console.log('⏳ [REDIRECT] Payment status is', finalPayment.status, ', redirecting to pending page');
    }

    const duration = Date.now() - startTime;
    console.log('🔄 [REDIRECT] Final redirect URL:', redirectUrl);
    console.log('🔄 [REDIRECT] Redirect URL components:', {
      frontendBase,
      path: redirectUrl.replace(frontendBase, ''),
      fullUrl: redirectUrl,
    });
    console.log(`✅ [REDIRECT] Redirect handler completed in ${duration}ms`);
    console.log('📤 [REDIRECT] Sending 302 redirect response with Location header...');
    console.log('═══════════════════════════════════════════════════════');
    
    // Use 302 (temporary redirect) - browsers will follow this
    return res.redirect(302, redirectUrl);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ [REDIRECT] Error in redirect handler after', duration, 'ms:', error);
    console.error('❌ [REDIRECT] Error stack:', error?.stack);
    const failedUrl = `${frontendBase}/payments/failed`;
    console.log('🔄 [REDIRECT] Redirecting to failed page (exception):', failedUrl);
    console.log('═══════════════════════════════════════════════════════');
    return res.redirect(302, failedUrl);
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

    // Get payment with user and business info before updating
    const existingPayment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        business: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!existingPayment) {
      return sendError(res, 404, 'Payment not found');
    }

    // Only create notification if status is actually changing
    const statusChanged = existingPayment.status !== status;

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        transactionId,
      },
    });

    // Create notification if status changed to COMPLETED or FAILED
    if (statusChanged) {
      try {
        if (status === 'COMPLETED') {
          await prisma.notification.create({
            data: {
              userId: existingPayment.userId,
              type: 'PAYMENT_SUCCESS',
              title: 'Payment Successful! ✅',
              message: `Your payment of ${existingPayment.amount} ${existingPayment.currency} for "${existingPayment.business?.name || 'business'}" has been completed successfully.${transactionId ? ` Transaction ID: ${transactionId}` : ''}`,
              link: `/payments/success?paymentId=${paymentId}${transactionId ? `&tranRef=${transactionId}` : ''}`,
            },
          });
        } else if (status === 'FAILED') {
          await prisma.notification.create({
            data: {
              userId: existingPayment.userId,
              type: 'PAYMENT_FAILED',
              title: 'Payment Failed ❌',
              message: `Your payment of ${existingPayment.amount} ${existingPayment.currency} for "${existingPayment.business?.name || 'business'}" has failed. Please try again or contact support if the issue persists.`,
              link: `/payments/failed?paymentId=${paymentId}${transactionId ? `&tranRef=${transactionId}` : ''}`,
            },
          });
        }
      } catch (notificationError) {
        // Don't fail the payment update if notification creation fails
        console.error('Failed to create payment notification:', notificationError);
      }
    }

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