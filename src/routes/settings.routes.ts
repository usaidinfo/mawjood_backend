import { Router } from 'express';
import { getSiteSettings, updateSiteSettings } from '../controllers/settings.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.get('/site', getSiteSettings);
router.patch('/site', authenticate, authorize('ADMIN'), updateSiteSettings);

export default router;

