import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';
import { emailService } from '../services/email.service';

// Define EnquiryStatus enum locally until Prisma Client is regenerated
enum EnquiryStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  CLOSED = 'CLOSED',
  REJECTED = 'REJECTED',
}

const prismaClient = prisma as any;

/**
 * Create a new enquiry
 * User must be logged in
 */
export const createEnquiry = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return sendError(res, 401, 'Unauthorized. Please login to send an enquiry.');
    }

    const { businessId, name, phone, email, message } = req.body;

    if (!businessId || !name || !phone || !email || !message) {
      return sendError(res, 400, 'All fields are required');
    }

    // Validate business exists
    const business = await prismaClient.business.findUnique({
      where: { id: businessId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    // Create enquiry
    const enquiry = await prismaClient.enquiry.create({
      data: {
        name,
        phone,
        email,
        message,
        userId,
        businessId,
        status: EnquiryStatus.OPEN,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    // Send email notification to business owner
    try {
      const enquiryUrl = `${process.env.FRONTEND_URL || 'https://mawjood.com'}/dashboard/enquiries`;
      const businessUrl = `${process.env.FRONTEND_URL || 'https://mawjood.com'}/business/${business.slug}`;
      
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Business Enquiry</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #1c4233 0%, #245240 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">New Business Enquiry</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #1c4233; margin-top: 0;">You have received a new enquiry</h2>
              <p>Hello ${business.user.firstName},</p>
              <p>You have received a new enquiry for your business <strong>${business.name}</strong>.</p>
              
              <div style="background: white; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #1c4233;">
                <h3 style="color: #1c4233; margin-top: 0;">Enquiry Details:</h3>
                <p style="margin: 10px 0;"><strong>Name:</strong> ${name}</p>
                <p style="margin: 10px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                <p style="margin: 10px 0;"><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>
                <p style="margin: 10px 0;"><strong>Business:</strong> ${business.name}</p>
              </div>
              
              <div style="background: white; padding: 20px; margin: 20px 0; border-radius: 5px;">
                <h3 style="color: #1c4233; margin-top: 0;">Message:</h3>
                <p style="white-space: pre-wrap; margin: 0;">${message}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${enquiryUrl}" 
                   style="background: #1c4233; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  View Enquiry
                </a>
              </div>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #666; font-size: 12px; margin: 0;">This is an automated message from Mawjood. Please do not reply to this email.</p>
            </div>
          </body>
        </html>
      `;

      await emailService.sendEmail({
        to: business.user.email,
        subject: `New Enquiry for ${business.name} - Mawjood`,
        html,
      });
    } catch (emailError) {
      console.error('Failed to send enquiry email:', emailError);
      // Don't fail the enquiry creation if email fails
    }

    // Create notification for business owner
    try {
      await prismaClient.notification.create({
        data: {
          userId: business.userId,
          type: 'NEW_ENQUIRY',
          title: 'New Business Enquiry',
          message: `You have received a new enquiry from ${name} for ${business.name}`,
          link: `/dashboard/enquiries?enquiryId=${enquiry.id}`,
        },
      });
    } catch (notificationError) {
      console.error('Failed to create notification:', notificationError);
      // Don't fail the enquiry creation if notification fails
    }

    return sendSuccess(res, 201, 'Enquiry submitted successfully', enquiry);
  } catch (error: any) {
    console.error('Create enquiry error:', error);
    return sendError(res, 500, 'Failed to create enquiry', error);
  }
};

/**
 * Get enquiries for a specific business (Business Owner only)
 */
export const getBusinessEnquiries = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return sendError(res, 401, 'Unauthorized');
    }

    const {
      page = '1',
      limit = '20',
      status,
      search,
      startDate,
      endDate,
    } = req.query;

    // Build where clause
    const where: any = {};

    // Business owners can only see their own business enquiries
    if (userRole === 'BUSINESS_OWNER') {
      const businesses = await prismaClient.business.findMany({
        where: { userId },
        select: { id: true },
      });
      where.businessId = { in: businesses.map((b: any) => b.id) };
    }

    if (status && typeof status === 'string') {
      where.status = status;
    }

    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { message: { contains: search } },
      ];
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate as string);
      }
    }

    const [enquiries, total] = await Promise.all([
      prismaClient.enquiry.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          business: {
            select: {
              id: true,
              name: true,
              slug: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
      }),
      prismaClient.enquiry.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Enquiries fetched successfully', {
      enquiries,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error: any) {
    console.error('Get business enquiries error:', error);
    return sendError(res, 500, 'Failed to fetch enquiries', error);
  }
};

/**
 * Get single enquiry by ID
 */
export const getEnquiryById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return sendError(res, 401, 'Unauthorized');
    }

    const enquiry = await prismaClient.enquiry.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            email: true,
            phone: true,
            userId: true,
          },
        },
      },
    });

    if (!enquiry) {
      return sendError(res, 404, 'Enquiry not found');
    }

    // Check permissions
    if (userRole === 'BUSINESS_OWNER') {
      // Business owner can only see their own business enquiries
      if (enquiry.business.userId !== userId) {
        return sendError(res, 403, 'Forbidden');
      }
    } else {
      // Regular user can only see their own enquiries
      if (enquiry.userId !== userId) {
        return sendError(res, 403, 'Forbidden');
      }
    }

    return sendSuccess(res, 200, 'Enquiry fetched successfully', enquiry);
  } catch (error: any) {
    console.error('Get enquiry by ID error:', error);
    return sendError(res, 500, 'Failed to fetch enquiry', error);
  }
};

/**
 * Update enquiry status (Business Owner or Admin)
 */
export const updateEnquiryStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, response } = req.body;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return sendError(res, 401, 'Unauthorized');
    }

    if (!status || !Object.values(EnquiryStatus).includes(status)) {
      return sendError(res, 400, 'Valid status is required');
    }

    const enquiry = await prismaClient.enquiry.findUnique({
      where: { id },
      include: {
        business: {
          select: {
            userId: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!enquiry) {
      return sendError(res, 404, 'Enquiry not found');
    }

    // Check permissions - Only business owners can update enquiries
    if (userRole !== 'BUSINESS_OWNER') {
      return sendError(res, 403, 'Forbidden. Only business owners can update enquiries.');
    }

    // Business owner can only update their own business enquiries
    if (enquiry.business.userId !== userId) {
      return sendError(res, 403, 'Forbidden');
    }

    // Update enquiry
    const updateData: any = {
      status,
    };

    // If response is provided and status is CLOSED or IN_PROGRESS, save response
    if (response && (status === EnquiryStatus.CLOSED || status === EnquiryStatus.IN_PROGRESS)) {
      updateData.response = response;
      updateData.responseDate = new Date();
    }

    const updatedEnquiry = await prismaClient.enquiry.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    // Send email notification to user if response is provided
    if (response && updatedEnquiry.user && updatedEnquiry.business) {
      try {
        const businessName = updatedEnquiry.business.name || 'the business';
        const businessSlug = updatedEnquiry.business.slug || '';
        const businessUrl = businessSlug 
          ? `${process.env.FRONTEND_URL || 'https://mawjood.com'}/business/${businessSlug}`
          : `${process.env.FRONTEND_URL || 'https://mawjood.com'}/businesses`;
        
        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Response to Your Enquiry</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #1c4233 0%, #245240 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">Response to Your Enquiry</h1>
              </div>
              <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                <h2 style="color: #1c4233; margin-top: 0;">Hello ${updatedEnquiry.user.firstName || 'there'},</h2>
                <p>You have received a response to your enquiry for <strong>${businessName}</strong>.</p>
                
                <div style="background: white; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #1c4233;">
                  <h3 style="color: #1c4233; margin-top: 0;">Response:</h3>
                  <p style="white-space: pre-wrap; margin: 0;">${response}</p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${businessUrl}" 
                     style="background: #1c4233; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                    View Business
                  </a>
                </div>
                
                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                <p style="color: #666; font-size: 12px; margin: 0;">This is an automated message from Mawjood. Please do not reply to this email.</p>
              </div>
            </body>
          </html>
        `;

        await emailService.sendEmail({
          to: updatedEnquiry.user.email,
          subject: `Response to Your Enquiry - ${businessName}`,
          html,
        });

        // Create notification for user
        await prismaClient.notification.create({
          data: {
            userId: updatedEnquiry.userId,
            type: 'ENQUIRY_RESPONSE',
            title: 'Response to Your Enquiry',
            message: `You have received a response from ${businessName}`,
            link: `/profile?tab=enquiries`,
          },
        });
      } catch (emailError) {
        console.error('Failed to send response email:', emailError);
        // Don't fail the update if email fails
      }
    }

    return sendSuccess(res, 200, 'Enquiry updated successfully', updatedEnquiry);
  } catch (error: any) {
    console.error('Update enquiry status error:', error);
    return sendError(res, 500, 'Failed to update enquiry', error);
  }
};

/**
 * Get all enquiries (Admin only)
 */
export const getAllEnquiries = async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user?.role;

    if (userRole !== 'ADMIN') {
      return sendError(res, 403, 'Forbidden. Only admins can view all enquiries.');
    }

    const {
      page = '1',
      limit = '20',
      status,
      search,
      categoryId,
      startDate,
      endDate,
    } = req.query;

    // Build where clause
    const where: any = {};

    if (status && typeof status === 'string') {
      where.status = status;
    }

    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { message: { contains: search } },
        { business: { name: { contains: search } } },
      ];
    }

    if (categoryId && typeof categoryId === 'string') {
      where.business = {
        categoryId,
      };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate as string);
      }
    }

    const [enquiries, total] = await Promise.all([
      prismaClient.enquiry.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          business: {
            select: {
              id: true,
              name: true,
              slug: true,
              email: true,
              phone: true,
              category: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
      }),
      prismaClient.enquiry.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Enquiries fetched successfully', {
      enquiries,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error: any) {
    console.error('Get all enquiries error:', error);
    return sendError(res, 500, 'Failed to fetch enquiries', error);
  }
};

/**
 * Get user's own enquiries
 */
export const getUserEnquiries = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendError(res, 401, 'Unauthorized');
    }

    const {
      page = '1',
      limit = '20',
      status,
    } = req.query;

    const where: any = {
      userId,
    };

    if (status && typeof status === 'string') {
      where.status = status;
    }

    const [enquiries, total] = await Promise.all([
      prismaClient.enquiry.findMany({
        where,
        include: {
          business: {
            select: {
              id: true,
              name: true,
              slug: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
      }),
      prismaClient.enquiry.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Enquiries fetched successfully', {
      enquiries,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error: any) {
    console.error('Get user enquiries error:', error);
    return sendError(res, 500, 'Failed to fetch enquiries', error);
  }
};

