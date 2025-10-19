import { Router } from 'express';
import { uploadImage, uploadMultipleImages } from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.post('/image', authenticate, upload.single('image'), uploadImage);
router.post('/images', authenticate, upload.array('images', 10), uploadMultipleImages);

export default router;