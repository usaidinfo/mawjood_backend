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

export interface RegisterDTO {
  email: string;
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: 'USER' | 'BUSINESS_OWNER';
}

export interface LoginDTO {
  email: string;
  password: string;
}

export type SocialProvider = 'google' | 'facebook';

export interface SocialLoginDTO {
  provider: SocialProvider;
  token: string;
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