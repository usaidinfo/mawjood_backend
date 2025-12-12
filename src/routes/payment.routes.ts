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
// IMPORTANT: These routes must be defined BEFORE other routes to avoid conflicts
router.post('/paytabs/callback', handlePayTabsCallback);
// Accept both GET and POST for return URL to avoid 405 from PayTabs
// PayTabs typically redirects with GET, but we support both for compatibility
router.get('/paytabs/return', handlePayTabsReturn);
router.post('/paytabs/return', handlePayTabsReturn);

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