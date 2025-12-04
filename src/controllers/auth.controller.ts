import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { hashPassword, comparePassword } from '../utils/password.util';
import { generateToken, generateRefreshToken } from '../utils/jwt.util';
import { sendSuccess, sendError } from '../utils/response.util';
import { generateOTP, storeOTP, verifyOTP, sendEmailOTP, sendPhoneOTP, storeRegistrationData, getRegistrationData } from '../utils/otp.util';
import { RegisterDTO, AuthRequest, SocialLoginDTO } from '../types';
import { capitalizeUserNames } from '../utils/name.util';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const baseUserSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  avatar: true,
  emailVerified: true,
  phoneVerified: true,
  createdAt: true,
  updatedAt: true,
};

type SelectedUser = Prisma.UserGetPayload<{ select: typeof baseUserSelect }>;

type ProviderProfile = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  emailVerified?: boolean;
};

const verifyGoogleToken = async (idToken: string): Promise<ProviderProfile> => {
  if (!googleClient || !GOOGLE_CLIENT_ID) {
    throw new Error('Google authentication is not configured');
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error('Invalid Google token');
  }

  return {
    email: payload.email,
    firstName: payload.given_name,
    lastName: payload.family_name,
    avatar: payload.picture,
    emailVerified: payload.email_verified,
  };
};

const fetchFacebookProfile = async (accessToken: string): Promise<ProviderProfile> => {
  const fields = 'id,email,first_name,last_name,picture';
  const url = `https://graph.facebook.com/me?fields=${fields}&access_token=${encodeURIComponent(
    accessToken,
  )}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to verify Facebook token');
  }

  const data = (await response.json()) as {
    email?: string;
    first_name?: string;
    last_name?: string;
    picture?: {
      data?: {
        url?: string;
      };
    };
  };

  return {
    email: data.email,
    firstName: data.first_name,
    lastName: data.last_name,
    avatar: data.picture?.data?.url,
    emailVerified: true,
  };
};

// Register user - store data temporarily and send OTP (user NOT created until OTP verified)
export const register = async (req: Request, res: Response) => {
  try {
    const { email, phone, password, firstName, lastName, role }: RegisterDTO = req.body;

    if (!email || !phone || !password || !firstName || !lastName) {
      return sendError(res, 400, 'All fields are required');
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: email.toLowerCase() }, { phone }],
      },
    });

    if (existingUser) {
      return sendError(res, 409, 'User with this email or phone already exists');
    }

    // Store registration data temporarily (NOT in database yet)
    storeRegistrationData(email.toLowerCase(), {
      phone,
      password,
      firstName,
      lastName,
      role: role || 'USER',
    });

    // Check if Saudi number (+966) - send to phone, otherwise to email
    const isSaudiNumber = phone.startsWith('+966');
    
    if (isSaudiNumber) {
      // For Saudi numbers, use phone OTP (test: 1234)
      const otp = '1234';
      storeOTP(phone, otp);
      // Skip actual SMS for testing
      // await sendPhoneOTP(phone, otp);
      
      return sendSuccess(
        res,
        200,
        'OTP sent to your phone. Please verify to complete registration.',
        {
          phone,
          otpSent: true,
          otpTarget: 'phone',
        }
      );
    } else {
      // For non-Saudi, send to email
      const otp = generateOTP();
      storeOTP(email.toLowerCase(), otp);
      await sendEmailOTP(email, otp);

      return sendSuccess(
        res,
        200,
        'OTP sent to your email. Please verify to complete registration.',
        {
          email,
          otpSent: true,
          otpTarget: 'email',
        }
      );
    }
  } catch (error) {
    console.error('Register error:', error);
    return sendError(res, 500, 'Failed to register user', error);
  }
};

// Login with Email/Phone + Password
export const loginWithPassword = async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body; // identifier can be email or phone

    if (!identifier || !password) {
      return sendError(res, 400, 'Identifier and password are required');
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier.toLowerCase() }, { phone: identifier }],
      },
    });

    if (!user || !user.password) {
      return sendError(res, 401, 'Invalid credentials');
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      return sendError(res, 401, 'Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      return sendError(res, 403, 'Account is suspended or inactive');
    }

    // Check if email is verified (required for email-based login)
    if (identifier.includes('@') && !user.emailVerified) {
      return sendError(
        res,
        403,
        'Email not verified. Please verify your email before logging in.'
      );
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const { password: _, ...userWithoutPassword } = user;

    return sendSuccess(res, 200, 'Login successful', {
      user: userWithoutPassword,
      token,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    return sendError(res, 500, 'Failed to login', error);
  }
};

// Send OTP to Email (for login - user must already exist)
export const sendEmailOTPController = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendError(res, 400, 'Email is required');
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user) {
      return sendError(res, 404, 'User not found. Please register first.');
    }

    if (user.status !== 'ACTIVE') {
      return sendError(res, 403, 'Account is suspended or inactive');
    }

    const otp = generateOTP();
    storeOTP(email.toLowerCase(), otp);
    await sendEmailOTP(email, otp);

    return sendSuccess(res, 200, 'OTP sent to email successfully', { email });
  } catch (error) {
    console.error('Send email OTP error:', error);
    return sendError(res, 500, 'Failed to send OTP', error);
  }
};

// Send OTP to Phone
export const sendPhoneOTPController = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return sendError(res, 400, 'Phone number is required');
    }

    const user = await prisma.user.findUnique({ where: { phone } });

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    // For testing: always use 1234 for phone OTP
    const otp = '1234';
    storeOTP(phone, otp);
    // Skip actual SMS sending for testing
    // await sendPhoneOTP(phone, otp);

    return sendSuccess(res, 200, 'OTP sent to phone successfully', { phone });
  } catch (error) {
    console.error('Send phone OTP error:', error);
    return sendError(res, 500, 'Failed to send OTP', error);
  }
};

// Verify Email OTP - Creates user if registration, or logs in if existing user
export const verifyEmailOTP = async (req: Request, res: Response) => {
  try {
    const { email, phone, otp } = req.body;

    if ((!email && !phone) || !otp) {
      return sendError(res, 400, 'Email or phone and OTP are required');
    }

    // Determine if this is phone or email OTP
    const identifier = phone || email?.toLowerCase();
    const isPhoneOTP = !!phone;
    
    const isValid = verifyOTP(identifier, otp);

    if (!isValid) {
      return sendError(res, 401, 'Invalid or expired OTP');
    }

    // Check if this is a registration flow (has temporary registration data)
    // Registration data is stored by email
    let registrationData = null;
    if (email) {
      registrationData = getRegistrationData(email.toLowerCase());
    } else if (phone) {
      // Try to find registration data by phone number
      // We need to search for the email that matches this phone in registration data
      // For now, we'll check using the phone's associated email from the stored data
      const allEmails = Object.keys((globalThis as any).__otpStore || {});
      for (const storedEmail of allEmails) {
        const data = getRegistrationData(storedEmail);
        if (data && data.phone === phone) {
          registrationData = data;
          break;
        }
      }
    }

    if (registrationData) {
      // REGISTRATION FLOW: Create user now that OTP is verified
      const userEmail = email?.toLowerCase() || Object.keys((globalThis as any).__otpStore || {}).find(e => {
        const data = getRegistrationData(e);
        return data && data.phone === phone;
      });

      if (!userEmail) {
        return sendError(res, 400, 'Registration data not found');
      }

      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email: userEmail }, { phone: registrationData.phone }],
        },
      });

      if (existingUser) {
        return sendError(res, 409, 'User with this email or phone already exists');
      }

      const hashedPassword = await hashPassword(registrationData.password);

      const user = await prisma.user.create({
        data: {
          email: userEmail,
          phone: registrationData.phone,
          password: hashedPassword,
          firstName: registrationData.firstName,
          lastName: registrationData.lastName,
          role: registrationData.role as 'USER' | 'BUSINESS_OWNER' | 'ADMIN',
          emailVerified: !isPhoneOTP,
          phoneVerified: isPhoneOTP,
        },
        select: baseUserSelect,
      });

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const refreshToken = generateRefreshToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return sendSuccess(res, 201, 'Registration successful. Account created and verified.', {
        user,
        token,
        refreshToken,
        isNewUser: true,
      });
    } else {
      // LOGIN FLOW: User already exists, just verify and login
      const user = isPhoneOTP
        ? await prisma.user.findUnique({ where: { phone }, select: baseUserSelect })
        : await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: baseUserSelect });

      if (!user) {
        return sendError(res, 404, 'User not found. Please register first.');
      }

      if (user.status !== 'ACTIVE') {
        return sendError(res, 403, 'Account is suspended or inactive');
      }

      // Update verification status
      if (isPhoneOTP) {
        await prisma.user.update({
          where: { phone },
          data: { phoneVerified: true },
        });
      } else {
        await prisma.user.update({
          where: { email: email.toLowerCase() },
          data: { emailVerified: true },
        });
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const refreshToken = generateRefreshToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return sendSuccess(res, 200, 'Login successful', {
        user,
        token,
        refreshToken,
        isNewUser: false,
      });
    }
  } catch (error) {
    console.error('Verify email OTP error:', error);
    return sendError(res, 500, 'Failed to verify OTP', error);
  }
};

// Verify Phone OTP and Login
export const verifyPhoneOTP = async (req: Request, res: Response) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return sendError(res, 400, 'Phone and OTP are required');
    }

    const isValid = verifyOTP(phone, otp);

    if (!isValid) {
      return sendError(res, 401, 'Invalid or expired OTP');
    }

    const user = await prisma.user.findUnique({
      where: { phone },
      select: baseUserSelect,
    });

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    if (user.status !== 'ACTIVE') {
      return sendError(res, 403, 'Account is suspended or inactive');
    }

    // Update phone verification status
    await prisma.user.update({
      where: { phone },
      data: { phoneVerified: true },
    });

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return sendSuccess(res, 200, 'Login successful', {
      user,
      token,
      refreshToken,
    });
  } catch (error) {
    console.error('Verify phone OTP error:', error);
    return sendError(res, 500, 'Failed to verify OTP', error);
  }
};

// Get current user
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: baseUserSelect,
    });

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    const capitalizedUser = capitalizeUserNames(user);
    return sendSuccess(res, 200, 'User fetched successfully', capitalizedUser);
  } catch (error) {
    console.error('Get me error:', error);
    return sendError(res, 500, 'Failed to fetch user', error);
  }
};

// Social login/register
export const socialLogin = async (req: Request, res: Response) => {
  try {
    const { provider, token, phone, role }: SocialLoginDTO & {
      phone?: string;
      role?: 'USER' | 'BUSINESS_OWNER';
    } = req.body;

    if (!provider || !token) {
      return sendError(res, 400, 'Provider and token are required');
    }

    let profile: ProviderProfile | null = null;

    if (provider === 'google') {
      profile = await verifyGoogleToken(token);
    } else if (provider === 'facebook') {
      profile = await fetchFacebookProfile(token);
    } else {
      return sendError(res, 400, 'Unsupported social provider');
    }

    const email = profile.email?.toLowerCase();

    if (!email) {
      return sendError(
        res,
        400,
        'Email address was not provided by the social provider. Please use another login method.',
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    let user: SelectedUser;
    let usedPlaceholderPhone = false;

    if (existingUser) {
      if (existingUser.status !== 'ACTIVE') {
        return sendError(res, 403, 'Account is suspended or inactive');
      }

      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          firstName: existingUser.firstName || profile.firstName || '',
          lastName: existingUser.lastName || profile.lastName || '',
          avatar: profile.avatar ?? existingUser.avatar,
          emailVerified: profile.emailVerified ?? true,
        },
        select: baseUserSelect,
      });
    } else {
      if (!phone) {
        return sendError(
          res,
          400,
          'Phone number is required to complete registration with social login',
        );
      }

      const phoneExists = await prisma.user.findUnique({ where: { phone } });
      if (phoneExists) {
        return sendError(res, 409, 'Phone number is already associated with another account');
      }

      let resolvedPhone = phone;

      if (!resolvedPhone) {
        resolvedPhone = `SOCIAL_${provider}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(-6)}`;
        usedPlaceholderPhone = true;
      }

      const hashedPassword = await hashPassword(
        `${provider}_${Date.now()}_${Math.random().toString(36).slice(-8)}`,
      );

      user = await prisma.user.create({
        data: {
          email,
          phone: resolvedPhone,
          password: hashedPassword,
          firstName: profile.firstName || '',
          lastName: profile.lastName || '',
          role: role === 'BUSINESS_OWNER' ? 'BUSINESS_OWNER' : 'USER',
          avatar: profile.avatar,
          emailVerified: true,
        },
        select: baseUserSelect,
      });
    }

    const jwtToken = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const capitalizedUser = capitalizeUserNames(user);

    return sendSuccess(res, 200, 'Social authentication successful', {
      user: capitalizedUser,
      token: jwtToken,
      refreshToken,
      isNewUser: !existingUser,
      needsPhoneUpdate: usedPlaceholderPhone,
      provider,
    });
  } catch (error) {
    console.error('Social login error:', error);
    return sendError(res, 500, 'Failed to authenticate with social provider', error);
  }
};