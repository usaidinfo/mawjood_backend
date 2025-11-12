import { Router } from 'express';
import {
  cancelBusinessSubscription,
  createBusinessSubscription,
  getBusinessSubscriptionById,
  getBusinessSubscriptions,
  syncExpiredSubscriptions,
} from '../controllers/subscription.controller';

const router = Router();

router.get('/', getBusinessSubscriptions);
router.get('/sync/expired', syncExpiredSubscriptions);
router.get('/:id', getBusinessSubscriptionById);
router.post('/', createBusinessSubscription);
router.patch('/:id/cancel', cancelBusinessSubscription);

export default router;
