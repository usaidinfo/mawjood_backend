import { Router } from 'express';
import {
  getAllBlogs,
  getBlogById,
  getBlogBySlug,
  getBlogBySlugAdmin,
  createBlog,
  updateBlog,
  deleteBlog,
  getAllBlogsAdmin,
  publishScheduledBlogs,
} from '../controllers/blog.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// Public routes
router.get('/', getAllBlogs);
router.get('/slug/:slug', getBlogBySlug);

// Public routes for cron jobs
router.get('/publish/scheduled', publishScheduledBlogs);

// Admin routes
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllBlogsAdmin);
router.get('/admin/slug/:slug', authenticate, authorize('ADMIN'), getBlogBySlugAdmin);
router.get('/:id', authenticate, authorize('ADMIN'), getBlogById);
router.post('/', authenticate, authorize('ADMIN'), upload.single('image'), createBlog);
router.put('/:id', authenticate, authorize('ADMIN'), upload.single('image'), updateBlog);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteBlog);

export default router;