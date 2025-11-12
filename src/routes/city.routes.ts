import { Router } from 'express';
import {
  getAllCountries,
  getAllRegions,
  getAllCities,
  getCityById,
  getCityBySlug,
  unifiedLocationSearch,
  createCountry,
  createRegion,
  createCity,
  updateCity,
  deleteCity,
  deleteRegion,
  deleteCountry,
} from '../controllers/city.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/countries', getAllCountries);
router.get('/regions', getAllRegions);
router.get('/search/unified', unifiedLocationSearch);
router.get('/', getAllCities);
router.get('/:id', getCityById);
router.get('/slug/:slug', getCityBySlug);

// Admin only routes
router.post('/countries', authenticate, authorize('ADMIN'), createCountry);
router.post('/regions', authenticate, authorize('ADMIN'), createRegion);
router.post('/', authenticate, authorize('ADMIN'), createCity);
router.put('/:id', authenticate, authorize('ADMIN'), updateCity);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteCity);
router.delete('/regions/:id', authenticate, authorize('ADMIN'), deleteRegion);
router.delete('/countries/:id', authenticate, authorize('ADMIN'), deleteCountry);

export default router;