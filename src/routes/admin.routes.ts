import { Router } from 'express';
import {
  getDashboardStats,
  getAllUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  getPendingBusinesses,
  suspendBusiness,
  getAnalytics,
} from '../controllers/admin.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// All routes are admin-only
router.use(authenticate, authorize('ADMIN'));

// Dashboard
router.get('/dashboard', getDashboardStats);
router.get('/analytics', getAnalytics);

// User management
router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);

// Business management
router.get('/businesses/pending', getPendingBusinesses);
router.patch('/businesses/:id/suspend', suspendBusiness);

export default router;