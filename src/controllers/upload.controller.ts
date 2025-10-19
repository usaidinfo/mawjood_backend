import { Response } from 'express';
import { AuthRequest } from '../types';
import { sendSuccess, sendError } from '../utils/response.util';
import { uploadToCloudinary } from '../config/cloudinary';
import fs from 'fs';

export const uploadImage = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return sendError(res, 400, 'No file uploaded');
    }

    const imageUrl = await uploadToCloudinary(req.file, 'mawjood');

    // Delete local file after upload
    fs.unlinkSync(req.file.path);

    return sendSuccess(res, 200, 'Image uploaded successfully', { imageUrl });
  } catch (error) {
    console.error('Upload error:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    return sendError(res, 500, 'Failed to upload image', error);
  }
};

export const uploadMultipleImages = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return sendError(res, 400, 'No files uploaded');
    }

    const uploadPromises = req.files.map((file) => uploadToCloudinary(file, 'mawjood'));
    const imageUrls = await Promise.all(uploadPromises);

    // Delete local files
    req.files.forEach((file) => fs.unlinkSync(file.path));

    return sendSuccess(res, 200, 'Images uploaded successfully', { imageUrls });
  } catch (error) {
    console.error('Upload error:', error);
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach((file) => fs.unlinkSync(file.path));
    }
    return sendError(res, 500, 'Failed to upload images', error);
  }
};