import dotenv from 'dotenv';

// Ensure environment variables are loaded even if this config is imported
// before the main app calls dotenv.config().
dotenv.config();

const backendBaseUrl =
  process.env.BACKEND_URL ||
  process.env.API_BASE_URL || // fallback if a different env var is used
  'http://localhost:5000';

// Build sensible defaults so PayTabs is always given absolute URLs.
const defaultCallbackUrl =
  process.env.PAYTABS_CALLBACK_URL ||
  `${backendBaseUrl}/api/payments/paytabs/callback`;

const defaultReturnUrl =
  process.env.PAYTABS_RETURN_URL ||
  `${backendBaseUrl}/api/payments/paytabs/return`;

export const paytabsConfig = {
  serverKey: process.env.PAYTABS_SERVER_KEY || '',
  profileId: process.env.PAYTABS_PROFILE_ID || '',
  apiUrl: process.env.PAYTABS_API_URL || 'https://secure.paytabs.sa',
  currency: process.env.PAYTABS_CURRENCY || 'SAR',
  callbackUrl: defaultCallbackUrl,
  returnUrl: defaultReturnUrl,
};

export const validatePaytabsConfig = (): boolean => {
  const required = ['serverKey', 'profileId', 'apiUrl'];
  return required.every((key) => !!paytabsConfig[key as keyof typeof paytabsConfig]);
};

