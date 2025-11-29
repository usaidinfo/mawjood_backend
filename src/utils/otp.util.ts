// In-memory OTP store (use Redis in production)
interface OTPStore {
  [key: string]: {
    otp: string;
    expiresAt: Date;
  };
}

// Temporary registration store (use Redis in production)
interface RegistrationData {
  email: string;
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  expiresAt: Date;
}

interface RegistrationStore {
  [key: string]: RegistrationData;
}

const otpStore: OTPStore = {};
const registrationStore: RegistrationStore = {};

export const generateOTP = (): string => {
  // Generate random 4-digit OTP
  return Math.floor(1000 + Math.random() * 9000).toString();
};

export const storeOTP = (identifier: string, otp: string): void => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiry

  otpStore[identifier] = {
    otp,
    expiresAt,
  };
};

export const verifyOTP = (identifier: string, otp: string): boolean => {
  const stored = otpStore[identifier];

  if (!stored) {
    return false;
  }

  if (new Date() > stored.expiresAt) {
    delete otpStore[identifier];
    return false;
  }

  if (stored.otp !== otp) {
    return false;
  }

  // OTP is valid, remove it
  delete otpStore[identifier];
  return true;
};

export const sendEmailOTP = async (email: string, otp: string): Promise<void> => {
  try {
    const { emailService } = await import('../services/email.service');
    await emailService.sendOTPEmail(email, otp);
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    // Don't throw - allow registration to continue even if email fails
    console.log(`📧 Email OTP for ${email}: ${otp} (fallback - email service unavailable)`);
  }
};

export const sendPhoneOTP = async (phone: string, otp: string): Promise<void> => {
  // TODO: Implement SMS sending (Twilio, etc.)
  console.log(`📱 Phone OTP for ${phone}: ${otp}`);
};

// Store temporary registration data (expires in 10 minutes)
export const storeRegistrationData = (email: string, data: Omit<RegistrationData, 'email' | 'expiresAt'>): void => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiry

  registrationStore[email.toLowerCase()] = {
    email: email.toLowerCase(),
    ...data,
    expiresAt,
  };
};

// Get and remove registration data
export const getRegistrationData = (email: string): RegistrationData | null => {
  const stored = registrationStore[email.toLowerCase()];

  if (!stored) {
    return null;
  }

  if (new Date() > stored.expiresAt) {
    delete registrationStore[email.toLowerCase()];
    return null;
  }

  // Remove after retrieval (one-time use)
  delete registrationStore[email.toLowerCase()];
  return stored;
};