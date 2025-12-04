import { Router } from 'express';
import {
  verifyCRBasic,
  verifyCRFull,
  getCRStatus,
  checkCROwnership,
  checkWathqStatus,
} from '../controllers/cr.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public endpoint to check if service is available
router.get('/status', checkWathqStatus);

// Protected endpoints - require authentication
router.get('/verify/basic/:crNumber', authenticate, verifyCRBasic);
router.get('/verify/full/:crNumber', authenticate, verifyCRFull);
router.get('/status/:crNumber', authenticate, getCRStatus);
router.get('/ownership/:id/:idType', authenticate, checkCROwnership);

export default router;

