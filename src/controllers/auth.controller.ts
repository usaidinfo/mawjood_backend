import { Request, Response } from 'express';
import prisma from '../config/database';
import { hashPassword, comparePassword } from '../utils/password.util';
import { generateToken, generateRefreshToken } from '../utils/jwt.util';
import { sendSuccess, sendError } from '../utils/response.util';
import { generateOTP, storeOTP, verifyOTP, sendEmailOTP, sendPhoneOTP } from '../utils/otp.util';
import { RegisterDTO, AuthRequest } from '../types';

// Register user (no OTP needed for registration)
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
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        createdAt: true,
      },
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

    return sendSuccess(res, 201, 'User registered successfully', {
      user,
      token,
      refreshToken,
    });
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
      select: {
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
      },
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
      select: {
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
      },
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
      select: {
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
      },
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