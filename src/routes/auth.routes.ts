import { Router } from 'express';
import {
  sendEmailOTPController,
  sendPhoneOTPController,
  verifyEmailOTP,
  verifyPhoneOTP,
  getMe,
  socialLogin,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Unified OTP flow - no separate register/login endpoints
router.post('/otp/send-email', sendEmailOTPController);
router.post('/otp/send-phone', sendPhoneOTPController);
router.post('/otp/verify-email', verifyEmailOTP);
router.post('/otp/verify-phone', verifyPhoneOTP);

// Social login (Google, Facebook)
router.post('/login/social', socialLogin);

// Get current user
router.get('/me', authenticate, getMe);

export default router;