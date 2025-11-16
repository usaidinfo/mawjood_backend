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
  getAllReviews,
  getPendingDeleteRequests,
  approveDeleteRequest,
  rejectDeleteRequest,
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

// Review management
router.get('/reviews', getAllReviews);
router.get('/reviews/pending-delete-requests', getPendingDeleteRequests);
router.patch('/reviews/:id/approve-delete', approveDeleteRequest);
router.patch('/reviews/:id/reject-delete', rejectDeleteRequest);

export default router;