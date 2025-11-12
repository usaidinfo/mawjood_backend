import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';

const prismaClient = prisma as any;

// Get all countries with their regions and cities
export const getAllCountries = async (_req: Request, res: Response) => {
  try {
    const countries = await prismaClient.country.findMany({
      include: {
        regions: {
          include: {
            cities: {
              orderBy: { name: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return sendSuccess(res, 200, 'Countries fetched successfully', countries);
  } catch (error) {
    console.error('Get countries error:', error);
    return sendError(res, 500, 'Failed to fetch countries', error);
  }
};

// Get all regions with cities
export const getAllRegions = async (_req: Request, res: Response) => {
  try {
    const regions = await prismaClient.region.findMany({
      include: {
        country: true,
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

    const cities = await prismaClient.city.findMany({
      where: regionId ? { regionId: regionId as string } : {},
      include: {
        region: {
          include: {
            country: true,
          },
        },
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

    const city = await prismaClient.city.findUnique({
      where: { id },
      include: {
        region: {
          include: {
            country: true,
          },
        },
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

    const city = await prismaClient.city.findUnique({
      where: { slug },
      include: {
        region: {
          include: {
            country: true,
          },
        },
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

// Create country (Admin only)
export const createCountry = async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug, code } = req.body;

    if (!name || !slug) {
      return sendError(res, 400, 'Name and slug are required');
    }

    const existingCountry = await prismaClient.country.findFirst({
      where: {
        OR: [{ slug }, { name }],
      },
    });

    if (existingCountry) {
      return sendError(res, 409, 'Country with this name or slug already exists');
    }

    if (code) {
      const existingCode = await prismaClient.country.findUnique({
        where: { code },
      });

      if (existingCode) {
        return sendError(res, 409, 'Country with this code already exists');
      }
    }

    const country = await prismaClient.country.create({
      data: { name, slug, code },
    });

    return sendSuccess(res, 201, 'Country created successfully', country);
  } catch (error) {
    console.error('Create country error:', error);
    return sendError(res, 500, 'Failed to create country', error);
  }
};

// Create region (Admin only)
export const createRegion = async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug, countryId } = req.body;

    if (!name || !slug || !countryId) {
      return sendError(res, 400, 'Name, slug, and countryId are required');
    }

    const existingRegion = await prismaClient.region.findUnique({
      where: { slug },
    });

    if (existingRegion) {
      return sendError(res, 409, 'Region with this slug already exists');
    }

    const country = await prismaClient.country.findUnique({
      where: { id: countryId },
    });

    if (!country) {
      return sendError(res, 404, 'Country not found');
    }

    const region = await prismaClient.region.create({
      data: { name, slug, countryId },
      include: { country: true },
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

    const existingCity = await prismaClient.city.findUnique({
      where: { slug },
    });

    if (existingCity) {
      return sendError(res, 409, 'City with this slug already exists');
    }

    const region = await prismaClient.region.findUnique({
      where: { id: regionId },
      include: {
        country: true,
      },
    });

    if (!region) {
      return sendError(res, 404, 'Region not found');
    }

    const city = await prismaClient.city.create({
      data: { name, slug, regionId },
      include: {
        region: {
          include: {
            country: true,
          },
        },
      },
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

    if (regionId) {
      const region = await prismaClient.region.findUnique({
        where: { id: regionId },
      });

      if (!region) {
        return sendError(res, 404, 'Region not found');
      }
    }

    const city = await prismaClient.city.update({
      where: { id },
      data: { name, slug, regionId },
      include: {
        region: {
          include: {
            country: true,
          },
        },
      },
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

    await prismaClient.city.delete({
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

    await prismaClient.region.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'Region deleted successfully');
  } catch (error) {
    console.error('Delete region error:', error);
    return sendError(res, 500, 'Failed to delete region', error);
  }
};

// Delete country (Admin only)
export const deleteCountry = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prismaClient.country.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'Country deleted successfully');
  } catch (error) {
    console.error('Delete country error:', error);
    return sendError(res, 500, 'Failed to delete country', error);
  }
};

// Unified search for countries, regions, and cities
export const unifiedLocationSearch = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;

    const searchTerm = typeof query === 'string' ? query.trim() : '';
    const hasSearch = searchTerm.length > 0;
    const searchLower = searchTerm.toLowerCase();
    const searchUpper = searchTerm.toUpperCase();

    const countryWhere = hasSearch
      ? {
          OR: [
            { name: { contains: searchTerm } },
            { name: { contains: searchLower } },
            { name: { contains: searchUpper } },
            { slug: { contains: searchLower } },
            { slug: { contains: searchTerm } },
            { code: searchUpper },
          ],
        }
      : {};

    const regionWhere = hasSearch
      ? {
          OR: [
            { name: { contains: searchTerm } },
            { name: { contains: searchLower } },
            { name: { contains: searchUpper } },
            { slug: { contains: searchLower } },
            { slug: { contains: searchTerm } },
          ],
        }
      : {};

    const cityWhere = hasSearch
      ? {
          OR: [
            { name: { contains: searchTerm } },
            { name: { contains: searchLower } },
            { name: { contains: searchUpper } },
            { slug: { contains: searchLower } },
            { slug: { contains: searchTerm } },
          ],
        }
      : {};

    const takeLimit = hasSearch ? undefined : 10;

    const [countries, regions, cities] = await Promise.all([
      prismaClient.country.findMany({
        where: countryWhere,
        orderBy: { name: 'asc' },
        take: takeLimit,
      }),
      prismaClient.region.findMany({
        where: regionWhere,
        include: { country: true },
        orderBy: { name: 'asc' },
        take: takeLimit,
      }),
      prismaClient.city.findMany({
        where: cityWhere,
        include: {
          region: {
            include: {
              country: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        take: takeLimit,
      }),
    ]);

    return sendSuccess(res, 200, 'Search completed successfully', {
      countries,
      regions,
      cities,
    });
  } catch (error) {
    console.error('Unified search error:', error);
    return sendError(res, 500, 'Failed to complete search', error);
  }
};