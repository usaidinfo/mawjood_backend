import { Router } from 'express';
import {
  getBlogCategories,
  getBlogCategoryBySlug,
  createBlogCategory,
  updateBlogCategory,
  deleteBlogCategory,
} from '../controllers/blogCategory.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.get('/', getBlogCategories);
router.get('/slug/:slug', getBlogCategoryBySlug);

router.post('/', authenticate, authorize('ADMIN'), createBlogCategory);
router.patch('/:id', authenticate, authorize('ADMIN'), updateBlogCategory); 
router.delete('/:id', authenticate, authorize('ADMIN'), deleteBlogCategory);

export default router;

