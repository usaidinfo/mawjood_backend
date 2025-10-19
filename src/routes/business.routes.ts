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
  deleteService,
  getAllBusinessesAdmin,
} from '../controllers/business.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// Public routes
router.get('/', getAllBusinesses);
router.get('/:id', getBusinessById);
router.get('/slug/:slug', getBusinessBySlug);
router.get('/:businessId/services', getBusinessServices);

// Protected routes (Business Owner/Admin)
router.post('/', authenticate, authorize('BUSINESS_OWNER', 'ADMIN'), 
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
    { name: 'images', maxCount: 10 }
  ]), 
  createBusiness
);
router.get('/my/businesses', authenticate, getMyBusinesses);
router.put('/:id', authenticate, 
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
    { name: 'images', maxCount: 10 }
  ]), 
  updateBusiness
);
router.delete('/:id', authenticate, deleteBusiness);
router.post('/:businessId/services', authenticate, addService);
router.delete('/services/:serviceId', authenticate, deleteService);

// Admin only routes
router.patch('/:id/approve', authenticate, authorize('ADMIN'), approveBusiness);
router.patch('/:id/reject', authenticate, authorize('ADMIN'), rejectBusiness);
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllBusinessesAdmin);


export default router;