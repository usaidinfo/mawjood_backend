import { Router } from 'express';
import {
  getUserPayments,
  getBusinessPayments,
  createPayment,
  updatePaymentStatus,
  getPaymentById,
  getAllPayments,
} from '../controllers/payment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Protected routes
router.get('/my-payments', authenticate, getUserPayments);
router.get('/:id', authenticate, getPaymentById);
router.post('/', authenticate, createPayment);
router.get('/business/:businessId', authenticate, getBusinessPayments);

// Webhook route (no auth - will be verified by PayTabs signature)
router.post('/webhook/:paymentId', updatePaymentStatus);

// Admin routes
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllPayments);

export default router;