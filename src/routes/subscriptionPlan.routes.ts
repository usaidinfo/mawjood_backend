import { Router } from 'express';
import {
  archiveSubscriptionPlan,
  createSubscriptionPlan,
  getSubscriptionPlanById,
  getSubscriptionPlans,
  updateSubscriptionPlan,
} from '../controllers/subscriptionPlan.controller';

const router = Router();

router.get('/', getSubscriptionPlans);
router.get('/:id', getSubscriptionPlanById);
router.post('/', createSubscriptionPlan);
router.patch('/:id', updateSubscriptionPlan);
router.delete('/:id', archiveSubscriptionPlan);

export default router;
