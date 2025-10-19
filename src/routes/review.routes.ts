import { Router } from 'express';
import {
  getBusinessReviews,
  createReview,
  updateReview,
  deleteReview,
  getUserReviews,
} from '../controllers/review.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/business/:businessId', getBusinessReviews);

// Protected routes
router.post('/', authenticate, createReview);
router.get('/my-reviews', authenticate, getUserReviews);
router.put('/:id', authenticate, updateReview);
router.delete('/:id', authenticate, deleteReview);

export default router;