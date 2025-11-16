import { Router } from 'express';
import {
  archiveSubscriptionPlan,
  createSubscriptionPlan,
  getSubscriptionPlanById,
  getSubscriptionPlans,
  updateSubscriptionPlan,
} from '../controllers/subscriptionPlan.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Public routes (for businesses to view plans)
router.get('/', getSubscriptionPlans);
router.get('/:id', getSubscriptionPlanById);

// Admin only routes
router.post('/', authenticate, authorize('ADMIN'), createSubscriptionPlan);
router.patch('/:id', authenticate, authorize('ADMIN'), updateSubscriptionPlan);
router.delete('/:id', authenticate, authorize('ADMIN'), archiveSubscriptionPlan);

export default router;
