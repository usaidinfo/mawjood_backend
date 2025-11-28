import { Router } from 'express';
import {
  getUserPayments,
  getBusinessPayments,
  createPayment,
  updatePaymentStatus,
  getPaymentById,
  getAllPayments,
  handlePayTabsCallback,
  handlePayTabsReturn,
} from '../controllers/payment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// PayTabs callback/webhook routes (no auth - verified by PayTabs API)
router.post('/paytabs/callback', handlePayTabsCallback);
router.get('/paytabs/return', handlePayTabsReturn);

// Protected routes
router.get('/my-payments', authenticate, getUserPayments);
router.get('/:id', authenticate, getPaymentById);
router.post('/', authenticate, createPayment);
router.get('/business/:businessId', authenticate, getBusinessPayments);

// Legacy webhook route (kept for backward compatibility)
router.post('/webhook/:paymentId', updatePaymentStatus);

// Admin routes
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllPayments);

export default router;  