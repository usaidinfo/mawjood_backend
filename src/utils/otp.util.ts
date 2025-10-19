// In-memory OTP store (use Redis in production)
interface OTPStore {
  [key: string]: {
    otp: string;
    expiresAt: Date;
  };
}

const otpStore: OTPStore = {};

export const generateOTP = (): string => {
  // For now, fixed OTP
  return '1234';
  // In production: return Math.floor(1000 + Math.random() * 9000).toString();
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
  // TODO: Implement email sending (Nodemailer, SendGrid, etc.)
  console.log(`📧 Email OTP for ${email}: ${otp}`);
};

export const sendPhoneOTP = async (phone: string, otp: string): Promise<void> => {
  // TODO: Implement SMS sending (Twilio, etc.)
  console.log(`📱 Phone OTP for ${phone}: ${otp}`);
};