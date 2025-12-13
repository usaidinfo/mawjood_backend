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
  handlePayTabsRedirect,
} from '../controllers/payment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();


// PayTabs callback/webhook routes (no auth - verified by PayTabs API)
// IMPORTANT: These routes must be defined BEFORE other routes to avoid conflicts
router.post('/paytabs/callback', handlePayTabsCallback);
router.post('/paytabs/return', handlePayTabsReturn);
router.get('/paytabs/redirect', handlePayTabsRedirect);

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