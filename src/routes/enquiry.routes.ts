import express from 'express';
import {
  createEnquiry,
  getAllEnquiries,
  getBusinessEnquiries,
  getEnquiryById,
  updateEnquiryStatus,
  getUserEnquiries,
} from '../controllers/enquiry.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Public route - Create enquiry (requires authentication)
router.post('/', authenticate, createEnquiry);

// User routes - Get own enquiries
router.get('/my-enquiries', authenticate, getUserEnquiries);

// Business owner routes - Get business enquiries
router.get('/business', authenticate, getBusinessEnquiries);

// Get single enquiry
router.get('/:id', authenticate, getEnquiryById);

// Update enquiry status (Business Owner or Admin)
router.put('/:id/status', authenticate, updateEnquiryStatus);

// Admin routes - Get all enquiries
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllEnquiries);

export default router;

