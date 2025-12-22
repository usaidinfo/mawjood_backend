import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
// Password utilities no longer needed for OTP flow, but keeping import for potential future use
// import { hashPassword, comparePassword } from '../utils/password.util';
import { generateToken, generateRefreshToken } from '../utils/jwt.util';
import { sendSuccess, sendError } from '../utils/response.util';
import { generateOTP, storeOTP, verifyOTP, sendEmailOTP, sendPhoneOTP, storeRegistrationData, getRegistrationData } from '../utils/otp.util';
import { AuthRequest, SocialLoginDTO, OTPRequestDTO } from '../types';
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

// Unified OTP flow - Send OTP to Email (auto-creates user if doesn't exist)
export const sendEmailOTPController = async (req: Request, res: Response) => {
  try {
    const { email, firstName, lastName, phone }: OTPRequestDTO = req.body;

    if (!email) {
      return sendError(res, 400, 'Email is required');
    }

    const emailLower = email.toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email: emailLower } });

    if (existingUser) {
      // Existing user - login flow
      if (existingUser.status !== 'ACTIVE') {
        return sendError(res, 403, 'Account is suspended or inactive');
      }

      const otp = generateOTP();
      storeOTP(emailLower, otp);
      await sendEmailOTP(email, otp);

      return sendSuccess(res, 200, 'OTP sent to email successfully', { 
        email,
        isNewUser: false 
      });
    } else {
      // New user - signup flow
      // Only send OTP if firstName and lastName are provided
      if (!firstName || !lastName) {
        return sendSuccess(res, 200, 'Please provide your name to continue', { 
          email,
          isNewUser: true,
          requiresName: true
        });
      }

      // Store temporary registration data
      storeRegistrationData(emailLower, {
        email: emailLower,
        phone: phone || '',
        firstName,
        lastName,
      });

      const otp = generateOTP();
      storeOTP(emailLower, otp);
      await sendEmailOTP(email, otp);

      return sendSuccess(res, 200, 'OTP sent to email successfully', { 
        email,
        isNewUser: true 
      });
    }
  } catch (error) {
    console.error('Send email OTP error:', error);
    return sendError(res, 500, 'Failed to send OTP', error);
  }
};

// Unified OTP flow - Send OTP to Phone (auto-creates user if doesn't exist, static OTP 12345)
export const sendPhoneOTPController = async (req: Request, res: Response) => {
  try {
    const { phone, firstName, lastName, email }: OTPRequestDTO = req.body;

    if (!phone) {
      return sendError(res, 400, 'Phone number is required');
    }

    const existingUser = await prisma.user.findUnique({ where: { phone } });

    if (existingUser) {
      // Existing user - login flow
      if (existingUser.status !== 'ACTIVE') {
        return sendError(res, 403, 'Account is suspended or inactive');
      }

      // Static OTP for phone: 12345
      const otp = '12345';
      storeOTP(phone, otp);
      // Skip actual SMS sending for testing
      // await sendPhoneOTP(phone, otp);

      return sendSuccess(res, 200, 'OTP sent to phone successfully', { 
        phone,
        isNewUser: false 
      });
    } else {
      // New user - signup flow
      // Only send OTP if firstName and lastName are provided
      if (!firstName || !lastName) {
        return sendSuccess(res, 200, 'Please provide your name to continue', { 
          phone,
          isNewUser: true,
          requiresName: true
        });
      }

      // Store temporary registration data
      const identifier = email ? email.toLowerCase() : phone;
      storeRegistrationData(identifier, {
        email: email || '',
        phone,
        firstName,
        lastName,
      });

      // Static OTP for phone: 12345
      const otp = '12345';
      storeOTP(phone, otp);
      // Skip actual SMS sending for testing
      // await sendPhoneOTP(phone, otp);

      return sendSuccess(res, 200, 'OTP sent to phone successfully', { 
        phone,
        isNewUser: true 
      });
    }
  } catch (error) {
    console.error('Send phone OTP error:', error);
    return sendError(res, 500, 'Failed to send OTP', error);
  }
};

// Verify Email OTP - Unified login/signup flow
export const verifyEmailOTP = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return sendError(res, 400, 'Email and OTP are required');
    }

    const emailLower = email.toLowerCase();
    const isValid = verifyOTP(emailLower, otp);

    if (!isValid) {
      return sendError(res, 401, 'Invalid or expired OTP');
    }

    // Check if this is a registration flow (has temporary registration data)
    const registrationData = getRegistrationData(emailLower);

    if (registrationData) {
      // REGISTRATION FLOW: Create user now that OTP is verified
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: emailLower },
            ...(registrationData.phone ? [{ phone: registrationData.phone }] : [])
          ],
        },
      });

      if (existingUser) {
        return sendError(res, 409, 'User with this email or phone already exists');
      }

      // Create user with empty password
      const user = await prisma.user.create({
        data: {
          email: emailLower,
          phone: registrationData.phone || null,
          password: '', // Empty password as per requirement
          firstName: registrationData.firstName || '',
          lastName: registrationData.lastName || '',
          role: 'BUSINESS_OWNER', // Default to BUSINESS_OWNER
          emailVerified: true,
          phoneVerified: false,
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
      const user = await prisma.user.findUnique({ 
        where: { email: emailLower }, 
        select: baseUserSelect 
      });

      if (!user) {
        return sendError(res, 404, 'User not found. Please register first.');
      }

      if (user.status !== 'ACTIVE') {
        return sendError(res, 403, 'Account is suspended or inactive');
      }

      // Update verification status
      await prisma.user.update({
        where: { email: emailLower },
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
        isNewUser: false,
      });
    }
  } catch (error) {
    console.error('Verify email OTP error:', error);
    return sendError(res, 500, 'Failed to verify OTP', error);
  }
};

// Verify Phone OTP - Unified login/signup flow
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

    // Check if this is a registration flow (has temporary registration data)
    const registrationData = getRegistrationData(phone);

    if (registrationData) {
      // REGISTRATION FLOW: Create user now that OTP is verified
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { phone },
            ...(registrationData.email ? [{ email: registrationData.email.toLowerCase() }] : [])
          ],
        },
      });

      if (existingUser) {
        return sendError(res, 409, 'User with this email or phone already exists');
      }

      // Create user with empty password
      const user = await prisma.user.create({
        data: {
          email: registrationData.email ? registrationData.email.toLowerCase() : null,
          phone,
          password: '', // Empty password as per requirement
          firstName: registrationData.firstName || '',
          lastName: registrationData.lastName || '',
          role: 'BUSINESS_OWNER', // Default to BUSINESS_OWNER
          emailVerified: false,
          phoneVerified: true,
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
        isNewUser: false,
      });
    }
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

    const email = profile.email?.toLowerCase() || null;

    // Note: Email can be null for social login, but we still allow registration
    // Users can add email/phone later in their profile settings

    // For social login, try to find user by email if provided, otherwise skip
    const existingUser = email 
      ? await prisma.user.findUnique({
          where: { email },
        })
      : null;

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
          // Update email if it was null and now we have it
          ...(email && !existingUser.email ? { email } : {}),
        },
        select: baseUserSelect,
      });
    } else {
      // New user registration - phone is optional
      if (phone) {
        // If phone is provided, check if it already exists
        const phoneExists = await prisma.user.findUnique({ where: { phone } });
        if (phoneExists) {
          return sendError(res, 409, 'Phone number is already associated with another account');
        }
        usedPlaceholderPhone = false;
      } else {
        usedPlaceholderPhone = true;
      }

      user = await prisma.user.create({
        data: {
          email,
          phone: phone || null,
          password: '', // Empty password as per requirement
          firstName: profile.firstName || '',
          lastName: profile.lastName || '',
          role: 'BUSINESS_OWNER', // Default to BUSINESS_OWNER (removed USER role)
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