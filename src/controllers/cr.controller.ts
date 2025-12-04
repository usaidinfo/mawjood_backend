import { Request, Response } from 'express';
import { sendError, sendSuccess } from '../utils/response.util';
import wathqService from '../services/wathq.service';

/**
 * Verify Commercial Registration (CR) number - Basic Info
 */
export const verifyCRBasic = async (req: Request, res: Response) => {
  try {
    const { crNumber } = req.params;
    const { language = 'ar' } = req.query;

    if (!crNumber) {
      return sendError(res, 400, 'CR number is required');
    }

    // Validate CR number format (must be 10 digits)
    if (!/^\d{10}$/.test(crNumber)) {
      return sendError(
        res,
        400,
        'Invalid CR number format. Must be exactly 10 digits'
      );
    }

    // Check if Wathq service is configured
    if (!wathqService.isConfigured()) {
      return sendError(
        res,
        503,
        'CR verification service is not configured. Please contact support.'
      );
    }

    const result = await wathqService.getBasicInfo(
      crNumber,
      language as 'ar' | 'en'
    );

    return sendSuccess(
      res,
      200,
      'CR verification successful',
      result.data
    );
  } catch (error: any) {
    console.error('CR Verification Error:', error);
    return sendError(
      res,
      error.message.includes('not found') ? 404 : 500,
      error.message || 'Failed to verify CR number'
    );
  }
};

/**
 * Verify Commercial Registration (CR) number - Full Info (includes owners)
 */
export const verifyCRFull = async (req: Request, res: Response) => {
  try {
    const { crNumber } = req.params;
    const { language = 'ar' } = req.query;

    if (!crNumber) {
      return sendError(res, 400, 'CR number is required');
    }

    // Validate CR number format (must be 10 digits)
    if (!/^\d{10}$/.test(crNumber)) {
      return sendError(
        res,
        400,
        'Invalid CR number format. Must be exactly 10 digits'
      );
    }

    // Check if Wathq service is configured
    if (!wathqService.isConfigured()) {
      return sendError(
        res,
        503,
        'CR verification service is not configured. Please contact support.'
      );
    }

    const result = await wathqService.getFullInfo(
      crNumber,
      language as 'ar' | 'en'
    );

    return sendSuccess(
      res,
      200,
      'CR verification successful',
      result.data
    );
  } catch (error: any) {
    console.error('CR Full Verification Error:', error);
    return sendError(
      res,
      error.message.includes('not found') ? 404 : 500,
      error.message || 'Failed to verify CR number'
    );
  }
};

/**
 * Get CR Status
 */
export const getCRStatus = async (req: Request, res: Response) => {
  try {
    const { crNumber } = req.params;
    const { language = 'ar', includeDates = 'false' } = req.query;

    if (!crNumber) {
      return sendError(res, 400, 'CR number is required');
    }

    if (!/^\d{10}$/.test(crNumber)) {
      return sendError(
        res,
        400,
        'Invalid CR number format. Must be exactly 10 digits'
      );
    }

    if (!wathqService.isConfigured()) {
      return sendError(
        res,
        503,
        'CR verification service is not configured. Please contact support.'
      );
    }

    const result = await wathqService.getStatus(
      crNumber,
      language as 'ar' | 'en',
      includeDates === 'true'
    );

    return sendSuccess(
      res,
      200,
      'CR status retrieved successfully',
      result.data
    );
  } catch (error: any) {
    console.error('CR Status Error:', error);
    return sendError(
      res,
      error.message.includes('not found') ? 404 : 500,
      error.message || 'Failed to get CR status'
    );
  }
};

/**
 * Check if a person/entity owns a CR
 */
export const checkCROwnership = async (req: Request, res: Response) => {
  try {
    const { id, idType } = req.params;
    const { nationality } = req.query;

    if (!id || !idType) {
      return sendError(res, 400, 'ID and ID type are required');
    }

    const validIdTypes = [
      'National_ID',
      'Resident_ID',
      'Passport',
      'GCC_ID',
      'CR_National_ID',
    ];

    if (!validIdTypes.includes(idType)) {
      return sendError(
        res,
        400,
        `Invalid ID type. Must be one of: ${validIdTypes.join(', ')}`
      );
    }

    if (!wathqService.isConfigured()) {
      return sendError(
        res,
        503,
        'CR verification service is not configured. Please contact support.'
      );
    }

    const result = await wathqService.checkOwnership(
      id,
      idType as any,
      nationality ? parseInt(nationality as string) : undefined
    );

    return sendSuccess(
      res,
      200,
      'Ownership check completed',
      result.data
    );
  } catch (error: any) {
    console.error('CR Ownership Check Error:', error);
    return sendError(
      res,
      500,
      error.message || 'Failed to check CR ownership'
    );
  }
};

/**
 * Check if Wathq service is available
 */
export const checkWathqStatus = async (req: Request, res: Response) => {
  try {
    const isConfigured = wathqService.isConfigured();

    return sendSuccess(res, 200, 'Service status checked', {
      available: isConfigured,
      message: isConfigured
        ? 'CR verification service is available'
        : 'CR verification service is not configured',
    });
  } catch (error: any) {
    console.error('Wathq Status Check Error:', error);
    return sendError(
      res,
      500,
      'Failed to check service status'
    );
  }
};

