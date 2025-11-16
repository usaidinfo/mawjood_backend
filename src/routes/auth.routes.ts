import { Router } from 'express';
import {
  register,
  loginWithPassword,
  sendEmailOTPController,
  sendPhoneOTPController,
  verifyEmailOTP,
  verifyPhoneOTP,
  getMe,
  socialLogin,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', register);

router.post('/login/password', loginWithPassword);
router.post('/login/social', socialLogin);

router.post('/otp/send-email', sendEmailOTPController);
router.post('/otp/send-phone', sendPhoneOTPController);
router.post('/otp/verify-email', verifyEmailOTP);
router.post('/otp/verify-phone', verifyPhoneOTP);

router.get('/me', authenticate, getMe);

export default router;