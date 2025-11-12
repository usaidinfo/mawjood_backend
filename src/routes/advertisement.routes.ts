import { Router } from 'express';
import {
  createAdvertisement,
  deleteAdvertisement,
  getAdvertisementById,
  getAdvertisementForDisplay,
  getAdvertisements,
  updateAdvertisement,
} from '../controllers/advertisement.controller';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.get('/display', getAdvertisementForDisplay);
router.get('/', getAdvertisements);
router.get('/:id', getAdvertisementById);
router.post('/', upload.single('image'), createAdvertisement);
router.patch('/:id', upload.single('image'), updateAdvertisement);
router.delete('/:id', deleteAdvertisement);

export default router;