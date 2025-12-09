import { Router } from 'express';
import {
  cancelBusinessSubscription,
  createBusinessSubscription,
  getBusinessSubscriptionById,
  getBusinessSubscriptions,
  syncExpiredSubscriptions,
  getAllSubscriptions,
  checkExpiringSubscriptions,
  assignSponsorSubscription,
} from '../controllers/subscription.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Public routes for cron jobs
router.get('/sync/expired', syncExpiredSubscriptions);
router.get('/check/expiring', checkExpiringSubscriptions);

// Protected routes
router.get('/', authenticate, getBusinessSubscriptions);
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllSubscriptions);
router.get('/:id', authenticate, getBusinessSubscriptionById);
router.post('/', authenticate, createBusinessSubscription);
router.post('/admin/assign-sponsor', authenticate, authorize('ADMIN'), assignSponsorSubscription);
router.patch('/:id/cancel', authenticate, cancelBusinessSubscription);

export default router;
