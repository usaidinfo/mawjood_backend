import { Request } from 'express';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
  search?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

// RegisterDTO and LoginDTO removed - using unified OTP flow instead
// For OTP flow, we'll use temporary registration data stored in memory
export interface OTPRequestDTO {
  email?: string;
  phone?: string;
  firstName?: string; // Optional for new users
  lastName?: string; // Optional for new users
}

export type SocialProvider = 'google' | 'facebook';

export interface SocialLoginDTO {
  provider: SocialProvider;
  token: string;
  phone?: string; // Required for new users
}

export interface BusinessDTO {
  name: string;
  description?: string;
  email: string;
  slug:string;
  phone: string;
  whatsapp?: string;
  website?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  categoryId: string;
  cityId: string;
  crNumber?: string;
  workingHours?: any;
}

export interface ReviewDTO {
  rating: number;
  comment?: string;
  businessId: string;
}

export interface ServiceDTO {
  name: string;
  description?: string;
  price: number;
  duration?: number;
}