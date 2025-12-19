import { Router } from 'express';
import {
  createAdvertisement,
  deleteAdvertisement,
  getAdvertisementById,
  getAdvertisementForDisplay,
  getAdvertisements,
  updateAdvertisement,
  syncAdvertisementStatus,
} from '../controllers/advertisement.controller';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// Public routes for cron jobs
router.get('/sync/status', syncAdvertisementStatus);

router.get('/display', getAdvertisementForDisplay);
router.get('/', getAdvertisements);
router.get('/:id', getAdvertisementById);
router.post('/', upload.single('image'), createAdvertisement);
router.patch('/:id', upload.single('image'), updateAdvertisement);
router.delete('/:id', deleteAdvertisement);

export default router;