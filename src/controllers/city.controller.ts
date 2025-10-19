import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';

// Get all regions with cities
export const getAllRegions = async (req: Request, res: Response) => {
  try {
    const regions = await prisma.region.findMany({
      include: {
        cities: {
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return sendSuccess(res, 200, 'Regions fetched successfully', regions);
  } catch (error) {
    console.error('Get regions error:', error);
    return sendError(res, 500, 'Failed to fetch regions', error);
  }
};

// Get all cities
export const getAllCities = async (req: Request, res: Response) => {
  try {
    const { regionId } = req.query;

    const cities = await prisma.city.findMany({
      where: regionId ? { regionId: regionId as string } : {},
      include: {
        region: true,
      },
      orderBy: { name: 'asc' },
    });

    return sendSuccess(res, 200, 'Cities fetched successfully', cities);
  } catch (error) {
    console.error('Get cities error:', error);
    return sendError(res, 500, 'Failed to fetch cities', error);
  }
};

// Get city by ID
export const getCityById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const city = await prisma.city.findUnique({
      where: { id },
      include: {
        region: true,
        businesses: {
          where: { status: 'APPROVED' },
          take: 10,
        },
      },
    });

    if (!city) {
      return sendError(res, 404, 'City not found');
    }

    return sendSuccess(res, 200, 'City fetched successfully', city);
  } catch (error) {
    console.error('Get city error:', error);
    return sendError(res, 500, 'Failed to fetch city', error);
  }
};

// Get city by slug
export const getCityBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const city = await prisma.city.findUnique({
      where: { slug },
      include: {
        region: true,
        businesses: {
          where: { status: 'APPROVED' },
          take: 10,
        },
      },
    });

    if (!city) {
      return sendError(res, 404, 'City not found');
    }

    return sendSuccess(res, 200, 'City fetched successfully', city);
  } catch (error) {
    console.error('Get city error:', error);
    return sendError(res, 500, 'Failed to fetch city', error);
  }
};

// Create region (Admin only)
export const createRegion = async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug } = req.body;

    if (!name || !slug) {
      return sendError(res, 400, 'Name and slug are required');
    }

    const existingRegion = await prisma.region.findUnique({
      where: { slug },
    });

    if (existingRegion) {
      return sendError(res, 409, 'Region with this slug already exists');
    }

    const region = await prisma.region.create({
      data: { name, slug },
    });

    return sendSuccess(res, 201, 'Region created successfully', region);
  } catch (error) {
    console.error('Create region error:', error);
    return sendError(res, 500, 'Failed to create region', error);
  }
};

// Create city (Admin only)
export const createCity = async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug, regionId } = req.body;

    if (!name || !slug || !regionId) {
      return sendError(res, 400, 'Name, slug, and regionId are required');
    }

    const existingCity = await prisma.city.findUnique({
      where: { slug },
    });

    if (existingCity) {
      return sendError(res, 409, 'City with this slug already exists');
    }

    const city = await prisma.city.create({
      data: { name, slug, regionId },
      include: { region: true },
    });

    return sendSuccess(res, 201, 'City created successfully', city);
  } catch (error) {
    console.error('Create city error:', error);
    return sendError(res, 500, 'Failed to create city', error);
  }
};

// Update city (Admin only)
export const updateCity = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, regionId } = req.body;

    const city = await prisma.city.update({
      where: { id },
      data: { name, slug, regionId },
      include: { region: true },
    });

    return sendSuccess(res, 200, 'City updated successfully', city);
  } catch (error) {
    console.error('Update city error:', error);
    return sendError(res, 500, 'Failed to update city', error);
  }
};

// Delete city (Admin only)
export const deleteCity = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.city.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'City deleted successfully');
  } catch (error) {
    console.error('Delete city error:', error);
    return sendError(res, 500, 'Failed to delete city', error);
  }
};

// Delete region (Admin only)
export const deleteRegion = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.region.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'Region deleted successfully');
  } catch (error) {
    console.error('Delete region error:', error);
    return sendError(res, 500, 'Failed to delete region', error);
  }
};