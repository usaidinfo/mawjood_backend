import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { verifyToken } from '../utils/jwt.util';
import { sendError } from '../utils/response.util';

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      sendError(res, 401, 'Authentication token is required');
      return;
    }

    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    sendError(res, 401, 'Invalid or expired token');
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, 'Unauthorized');
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(res, 403, 'Access denied');
      return;
    }

    next();
  };
};

export const validateRequest = (schema: any) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      sendError(res, 400, error.details[0].message);
      return;
    }
    
    next();
  };
};

export const errorHandler = (
  error: any,
  _req: AuthRequest,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Error:', error);

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  sendError(res, statusCode, message, error);
};