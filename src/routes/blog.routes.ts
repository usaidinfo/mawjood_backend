import { Router } from 'express';
import {
  getAllBlogs,
  getBlogById,
  getBlogBySlug,
  createBlog,
  updateBlog,
  deleteBlog,
  getAllBlogsAdmin,
} from '../controllers/blog.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// Public routes
router.get('/', getAllBlogs);
router.get('/:id', getBlogById);
router.get('/slug/:slug', getBlogBySlug);

// Admin routes
router.post('/', authenticate, authorize('ADMIN'), upload.single('image'), createBlog);
router.put('/:id', authenticate, authorize('ADMIN'), upload.single('image'), updateBlog);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteBlog);
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllBlogsAdmin);

export default router;