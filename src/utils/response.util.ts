import { Response } from 'express';

export const sendSuccess = (
  res: Response,
  statusCode: number = 200,
  message: string = 'Success',
  data: any = null
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const sendError = (
  res: Response,
  statusCode: number = 500,
  message: string = 'Internal Server Error',
  error: any = null
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error : undefined,
  });
};