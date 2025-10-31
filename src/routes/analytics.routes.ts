import { Router } from 'express';
import { getDashboardAnalytics, getBusinessAnalytics, getMyDashboardStats } from '../controllers/analytics.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Dashboard overview analytics
router.get('/dashboard', authenticate, getDashboardAnalytics);

// Individual business analytics
router.get('/business/:id', authenticate, getBusinessAnalytics);

router.get('/my-stats', authenticate, getMyDashboardStats);
export default router;