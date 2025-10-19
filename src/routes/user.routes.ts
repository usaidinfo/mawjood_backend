import { Router } from 'express';
import {
  getUserProfile,
  updateUserProfile,
  addToFavourites,
  removeFromFavourites,
  getUserFavourites,
  changePassword,
} from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// All routes are protected
router.get('/profile', authenticate, getUserProfile);
router.put('/profile', authenticate, upload.single('avatar'), updateUserProfile);
router.post('/favourites', authenticate, addToFavourites);
router.delete('/favourites/:businessId', authenticate, removeFromFavourites);
router.get('/favourites', authenticate, getUserFavourites);
router.put('/change-password', authenticate, changePassword);

export default router;