import { Router } from 'express';
import {
  getAllBusinesses,
  getBusinessById,
  getBusinessBySlug,
  createBusiness,
  updateBusiness,
  deleteBusiness,
  getMyBusinesses,
  approveBusiness,
  rejectBusiness,
  addService,
  getBusinessServices,
  updateService,
  deleteService,
  getAllBusinessesAdmin,
  unifiedSearch,
  getFeaturedBusinesses,
  trackBusinessView,
  getBusinessAnalytics,
  getMyBusinessesServices,
  getMyBusinessesReviews,
  diagnosePerformance
} from '../controllers/business.controller';
import { authenticate, authenticateOptional, authorize } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// Public routes
router.get('/diagnose', diagnosePerformance)
router.get('/', getAllBusinesses);
router.get('/search/unified', unifiedSearch);
router.get('/featured', getFeaturedBusinesses);

router.get('/my/businesses', authenticate, getMyBusinesses);
router.get('/my/services', authenticate, getMyBusinessesServices);
router.get('/my/reviews', authenticate, getMyBusinessesReviews);

// Optional auth routes - checks if user is authenticated but doesn't require it
router.get('/slug/:slug', authenticateOptional, getBusinessBySlug);
router.get('/:id', authenticateOptional, getBusinessById);
router.get('/:businessId/services', getBusinessServices);
router.post('/:id/view', trackBusinessView);
router.get('/:id/analytics', authenticate, getBusinessAnalytics);

// Protected routes (Business Owner/Admin)
router.post('/', authenticate, authorize('BUSINESS_OWNER', 'ADMIN'), 
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
    { name: 'images', maxCount: 10 }
  ]), 
  createBusiness
);

router.put('/:id', authenticate, 
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
    { name: 'images', maxCount: 10 }
  ]), 
  updateBusiness
);
router.delete('/:id', authenticate, deleteBusiness);
router.post('/:businessId/services', authenticate, 
  upload.fields([
    { name: 'image', maxCount: 1 }
  ]), 
  addService
);
router.put('/services/:serviceId', authenticate,
  upload.fields([
    { name: 'image', maxCount: 1 }
  ]),
  updateService
);
router.delete('/services/:serviceId', authenticate, deleteService);


// Admin only routes
router.patch('/:id/approve', authenticate, authorize('ADMIN'), approveBusiness);
router.patch('/:id/reject', authenticate, authorize('ADMIN'), rejectBusiness);
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllBusinessesAdmin);


export default router;