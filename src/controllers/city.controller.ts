import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest } from '../types';

const prismaClient = prisma as any;

// Get all countries with their regions and cities
export const getAllCountries = async (req: Request, res: Response) => {
  try {
    const { search } = req.query;

    const where: any = {};
    
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { name: { contains: searchTerm } },
        { slug: { contains: searchTerm.toLowerCase() } },
        { code: { contains: searchTerm.toUpperCase() } },
      ];
    }

    const countries = await prismaClient.country.findMany({
      where,
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
export const getAllRegions = async (req: Request, res: Response) => {
  try {
    const { countryId, search } = req.query;

    const where: any = {};
    
    if (countryId) {
      where.countryId = countryId as string;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { name: { contains: searchTerm } },
        { slug: { contains: searchTerm.toLowerCase() } },
      ];
    }

    const regions = await prismaClient.region.findMany({
      where,
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

// Update region (Admin only)
export const updateRegion = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, countryId } = req.body;

    const existingRegion = await prismaClient.region.findUnique({
      where: { id },
    });

    if (!existingRegion) {
      return sendError(res, 404, 'Region not found');
    }

    // Check if slug is being changed and if it conflicts
    if (slug && slug !== existingRegion.slug) {
      const slugConflict = await prismaClient.region.findUnique({
        where: { slug },
      });

      if (slugConflict) {
        return sendError(res, 409, 'Region with this slug already exists');
      }
    }

    // Validate country if being changed
    if (countryId && countryId !== existingRegion.countryId) {
      const country = await prismaClient.country.findUnique({
        where: { id: countryId },
      });

      if (!country) {
        return sendError(res, 404, 'Country not found');
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (slug) updateData.slug = slug;
    if (countryId) updateData.countryId = countryId;

    const region = await prismaClient.region.update({
      where: { id },
      data: updateData,
      include: { country: true },
    });

    return sendSuccess(res, 200, 'Region updated successfully', region);
  } catch (error) {
    console.error('Update region error:', error);
    return sendError(res, 500, 'Failed to update region', error);
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

// Update country (Admin only)
export const updateCountry = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, code } = req.body;

    const existingCountry = await prismaClient.country.findUnique({
      where: { id },
    });

    if (!existingCountry) {
      return sendError(res, 404, 'Country not found');
    }

    // Check if name is being changed and if it conflicts
    if (name && name !== existingCountry.name) {
      const nameConflict = await prismaClient.country.findFirst({
        where: {
          name,
          NOT: { id },
        },
      });

      if (nameConflict) {
        return sendError(res, 409, 'Country with this name already exists');
      }
    }

    // Check if slug is being changed and if it conflicts
    if (slug && slug !== existingCountry.slug) {
      const slugConflict = await prismaClient.country.findUnique({
        where: { slug },
      });

      if (slugConflict) {
        return sendError(res, 409, 'Country with this slug already exists');
      }
    }

    // Check if code is being changed and if it conflicts
    if (code && code !== existingCountry.code) {
      const codeConflict = await prismaClient.country.findUnique({
        where: { code },
      });

      if (codeConflict) {
        return sendError(res, 409, 'Country with this code already exists');
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (slug) updateData.slug = slug;
    if (code !== undefined) updateData.code = code || null;

    const country = await prismaClient.country.update({
      where: { id },
      data: updateData,
    });

    return sendSuccess(res, 200, 'Country updated successfully', country);
  } catch (error) {
    console.error('Update country error:', error);
    return sendError(res, 500, 'Failed to update country', error);
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