import { Router } from 'express';
import {
  getAllTouristPlaces,
  getTouristPlaceBySlug,
  getTouristPlaceBySlugAdmin,
  getAllTouristPlacesAdmin,
  createTouristPlace,
  updateTouristPlace,
  deleteTouristPlace,
  getTouristPlaceBusinesses,
} from '../controllers/touristPlace.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// Public routes
router.get('/', getAllTouristPlaces);
router.get('/slug/:slug', getTouristPlaceBySlug);
router.get('/slug/:slug/businesses/:sectionId', getTouristPlaceBusinesses);

// Admin routes
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllTouristPlacesAdmin);
router.get('/admin/slug/:slug', authenticate, authorize('ADMIN'), getTouristPlaceBySlugAdmin);
router.post('/', authenticate, authorize('ADMIN'), 
  upload.fields([
    { name: 'galleryImages', maxCount: 20 },
    { name: 'attractionImages', maxCount: 50 }
  ]), 
  createTouristPlace
);
router.put('/:id', authenticate, authorize('ADMIN'),
  upload.fields([
    { name: 'galleryImages', maxCount: 20 },
    { name: 'attractionImages', maxCount: 50 }
  ]),
  updateTouristPlace
);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteTouristPlace);

export default router;

