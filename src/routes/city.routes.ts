import { Router } from 'express';
import {
  getAllRegions,
  getAllCities,
  getCityById,
  getCityBySlug,
  createRegion,
  createCity,
  updateCity,
  deleteCity,
  deleteRegion,
} from '../controllers/city.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/regions', getAllRegions);
router.get('/', getAllCities);
router.get('/:id', getCityById);
router.get('/slug/:slug', getCityBySlug);

// Admin only routes
router.post('/regions', authenticate, authorize('ADMIN'), createRegion);
router.post('/', authenticate, authorize('ADMIN'), createCity);
router.put('/:id', authenticate, authorize('ADMIN'), updateCity);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteCity);
router.delete('/regions/:id', authenticate, authorize('ADMIN'), deleteRegion);

export default router;