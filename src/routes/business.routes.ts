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
import { authenticate, authorize } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// Public routes
router.get('/diagnose', diagnosePerformance)
router.get('/', getAllBusinesses);
router.get('/search/unified', unifiedSearch);
router.get('/featured', getFeaturedBusinesses);
router.get('/slug/:slug', getBusinessBySlug);

router.get('/my/businesses', authenticate, getMyBusinesses);
router.get('/my/services', authenticate, getMyBusinessesServices);
router.get('/my/reviews', authenticate, getMyBusinessesReviews);

router.get('/:id', getBusinessById);
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