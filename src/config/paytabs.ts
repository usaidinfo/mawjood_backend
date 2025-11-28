export const paytabsConfig = {
  serverKey: process.env.PAYTABS_SERVER_KEY || '',
  profileId: process.env.PAYTABS_PROFILE_ID || '',
  apiUrl: process.env.PAYTABS_API_URL || 'https://secure.paytabs.sa',
  currency: process.env.PAYTABS_CURRENCY || 'SAR',
  callbackUrl: process.env.PAYTABS_CALLBACK_URL || '',
  returnUrl: process.env.PAYTABS_RETURN_URL || '',
};

export const validatePaytabsConfig = (): boolean => {
  const required = ['serverKey', 'profileId', 'apiUrl'];
  return required.every((key) => !!paytabsConfig[key as keyof typeof paytabsConfig]);
};

