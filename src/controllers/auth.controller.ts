import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { hashPassword, comparePassword } from '../utils/password.util';
import { generateToken, generateRefreshToken } from '../utils/jwt.util';
import { sendSuccess, sendError } from '../utils/response.util';
import { generateOTP, storeOTP, verifyOTP, sendEmailOTP, sendPhoneOTP } from '../utils/otp.util';
import { RegisterDTO, AuthRequest, SocialLoginDTO } from '../types';

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

// Register user and send OTP to phone for verification
export const register = async (req: Request, res: Response) => {
  try {
    const { email, phone, password, firstName, lastName, role }: RegisterDTO = req.body;

    if (!email || !phone || !password || !firstName || !lastName) {
      return sendError(res, 400, 'All fields are required');
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
    });

    if (existingUser) {
      return sendError(res, 409, 'User with this email or phone already exists');
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        phone,
        password: hashedPassword,
        firstName,
        lastName,
        role: role || 'USER',
      },
      select: baseUserSelect,
    });

    const otp = generateOTP();

    // Store OTP for email only (signup OTP only goes to email)
    storeOTP(email.toLowerCase(), otp);

    // Send OTP to email only
    await sendEmailOTP(email, otp);

    return sendSuccess(
      res,
      201,
      'User registered successfully. OTP sent to your email for verification.',
      {
        email,
        otpSent: true,
        userId: user.id,
      }
    );
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
        OR: [{ email: identifier }, { phone: identifier }],
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

// Send OTP to Email
export const sendEmailOTPController = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendError(res, 400, 'Email is required');
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    const otp = generateOTP();
    storeOTP(email, otp);
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

    const otp = generateOTP();
    storeOTP(phone, otp);
    await sendPhoneOTP(phone, otp);

    return sendSuccess(res, 200, 'OTP sent to phone successfully', { phone });
  } catch (error) {
    console.error('Send phone OTP error:', error);
    return sendError(res, 500, 'Failed to send OTP', error);
  }
};

// Verify Email OTP and Login
export const verifyEmailOTP = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return sendError(res, 400, 'Email and OTP are required');
    }

    const isValid = verifyOTP(email, otp);

    if (!isValid) {
      return sendError(res, 401, 'Invalid or expired OTP');
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: baseUserSelect,
    });

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    if (user.status !== 'ACTIVE') {
      return sendError(res, 403, 'Account is suspended or inactive');
    }

    // Update email verification status
    await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
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

    return sendSuccess(res, 200, 'User fetched successfully', user);
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

    return sendSuccess(res, 200, 'Social authentication successful', {
      user,
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