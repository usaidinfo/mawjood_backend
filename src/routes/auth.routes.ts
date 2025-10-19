import { Router } from 'express';
import {
  register,
  loginWithPassword,
  sendEmailOTPController,
  sendPhoneOTPController,
  verifyEmailOTP,
  verifyPhoneOTP,
  getMe,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Registration
router.post('/register', register);

// Login with password
router.post('/login/password', loginWithPassword);

// OTP routes
router.post('/otp/send-email', sendEmailOTPController);
router.post('/otp/send-phone', sendPhoneOTPController);
router.post('/otp/verify-email', verifyEmailOTP);
router.post('/otp/verify-phone', verifyPhoneOTP);

// Protected routes
router.get('/me', authenticate, getMe);

export default router;