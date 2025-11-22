import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthRequest, BusinessDTO } from '../types';
import { uploadToCloudinary } from '../config/cloudinary';

type LocationType = 'city' | 'region' | 'country';

interface LocationLevel {
  type: LocationType;
  id: string;
  name: string;
  cityIds: string[];
}

interface LocationHierarchyResult {
  resolvedType: LocationType;
  resolvedName: string;
  requestedId: string;
  levels: LocationLevel[];
}

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const CACHE_TTL_MS = 60 * 1000;
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;

const getBusinessCache = () => {
  const globalRef = globalThis as typeof globalThis & {
    __businessCache?: Map<string, CacheEntry<any>>;
  };

  if (!globalRef.__businessCache) {
    globalRef.__businessCache = new Map();
  }

  return globalRef.__businessCache;
};

const getLocationCache = () => {
  const globalRef = globalThis as typeof globalThis & {
    __locationHierarchyCache?: Map<string, CacheEntry<LocationHierarchyResult | null>>;
  };

  if (!globalRef.__locationHierarchyCache) {
    globalRef.__locationHierarchyCache = new Map();
  }

  return globalRef.__locationHierarchyCache;
};

const uniqueCityIds = (ids: (string | null | undefined)[]): string[] =>
  Array.from(new Set(ids.filter(Boolean) as string[]));

const normaliseLocationType = (value?: string): LocationType | undefined => {
  if (value === 'city' || value === 'region' || value === 'country') {
    return value;
  }
  return undefined;
};

const prismaClient = prisma as any;

const fetchRegionCityIds = async (regionId: string): Promise<string[]> => {
  const cities = await prismaClient.city.findMany({
    where: { regionId },
    select: { id: true },
  });
  return uniqueCityIds(cities.map((c) => c.id));
};

const resolveLocationHierarchy = async (
  locationId: string,
  locationType?: string
): Promise<LocationHierarchyResult | null> => {
  const requestedType = normaliseLocationType(locationType);

  const locationCache = getLocationCache();
  const cacheKey = `${locationId}:${requestedType ?? 'auto'}`;
  const cached = locationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  if (!requestedType || requestedType === 'city') {
    const city = await prismaClient.city.findUnique({
      where: { id: locationId },
      select: {
        id: true,
        name: true,
        regionId: true,
      },
    });

    if (city) {
      const levels: LocationLevel[] = [
        {
          type: 'city',
          id: city.id,
          name: city.name,
          cityIds: [city.id],
        },
      ];

      if (city.regionId) {
        const region = await prismaClient.region.findUnique({
          where: { id: city.regionId },
          select: {
            id: true,
            name: true,
          },
        });

        if (region) {
          const regionCityIds = await fetchRegionCityIds(region.id);
          if (regionCityIds.length > 0) {
            levels.push({
              type: 'region',
              id: region.id,
              name: region.name,
              cityIds: regionCityIds,
            });
          }
        }
      }

      const result: LocationHierarchyResult = {
        resolvedType: 'city',
        resolvedName: city.name,
        requestedId: city.id,
        levels,
      };
      locationCache.set(cacheKey, {
        expiresAt: Date.now() + LOCATION_CACHE_TTL_MS,
        value: result,
      });
      return result;
    }
  }

  if (!requestedType || requestedType === 'region') {
    const region = await prismaClient.region.findUnique({
      where: { id: locationId },
      select: {
        id: true,
        name: true,
        countryId: true,
      },
    });

    if (region) {
      const levels: LocationLevel[] = [];
      const regionCityIds = await fetchRegionCityIds(region.id);
      if (regionCityIds.length > 0) {
        levels.push({
          type: 'region',
          id: region.id,
          name: region.name,
          cityIds: regionCityIds,
        });
      }

      const result: LocationHierarchyResult = {
        resolvedType: 'region',
        resolvedName: region.name,
        requestedId: region.id,
        levels,
      };
      locationCache.set(cacheKey, {
        expiresAt: Date.now() + LOCATION_CACHE_TTL_MS,
        value: result,
      });
      return result;
    }
  }

  return null;
};

// Helper function to execute business query with location filter
const executeBusinessQuery = async (
  baseConditions: string[],
  baseParams: any[],
  locationCondition: string | null,
  locationParams: any[],
  orderByClause: string,
  take: number,
  skip: number
) => {
  const allConditions = [...baseConditions];
  const allParams = [...baseParams];
  
  if (locationCondition) {
    allConditions.push(locationCondition);
    allParams.push(...locationParams);
  }
  
  const whereClause = allConditions.length > 0 ? `WHERE ${allConditions.join(' AND ')}` : '';
  
  const [countResult, businesses] = await Promise.all([
    prisma.$queryRawUnsafe<[{ total: bigint }]>(
      `SELECT COUNT(*) as total FROM Business b ${whereClause}`,
      ...allParams
    ),
    prisma.$queryRawUnsafe<any[]>(
      `
      SELECT 
        b.id, b.name, b.slug, b.description, b.email, b.phone, 
        b.whatsapp, b.website, b.address, b.latitude, b.longitude,
        b.images, b.logo, b.logoAlt, b.coverImage, b.coverImageAlt,
        b.metaTitle, b.metaDescription, b.keywords,
        b.status, b.averageRating, b.totalReviews, b.workingHours,
        b.isVerified, b.promotedUntil, b.createdAt, b.updatedAt,
        c.id as category_id, c.name as category_name, 
        c.slug as category_slug, c.icon as category_icon,
        ci.id as city_id, ci.name as city_name, ci.slug as city_slug,
        r.id as region_id, r.name as region_name, r.slug as region_slug,
        co.id as country_id, co.name as country_name,
        u.id as user_id, u.firstName, u.lastName, u.email as user_email
      FROM Business b
      LEFT JOIN Category c ON b.categoryId = c.id
      LEFT JOIN City ci ON b.cityId = ci.id
      LEFT JOIN Region r ON ci.regionId = r.id
      LEFT JOIN Country co ON r.countryId = co.id
      LEFT JOIN User u ON b.userId = u.id
      ${whereClause}
      ${orderByClause}
      LIMIT ? OFFSET ?
      `,
      ...allParams,
      take,
      skip
    )
  ]);
  
  return { countResult, businesses };
};

export const getAllBusinesses = async (req: Request, res: Response) => {
  try {
    const requestStart = Date.now();
    const {
      page = '1',
      limit = '10',
      search,
      categoryId,
      categoryIds,
      cityId,
      locationId,
      locationType,
      status = 'APPROVED',
      isVerified,
      sortBy = 'newest',
      rating,
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Cache check
    const cacheKey = JSON.stringify({
      page, limit, search, categoryId, categoryIds, cityId, 
      locationId, locationType, status, isVerified, sortBy, rating,
    });

    const businessCache = getBusinessCache();
    const cachedResponse = businessCache.get(cacheKey);
    if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
      console.log('[CACHE HIT] Returning cached response');
      return sendSuccess(res, 200, 'Businesses fetched successfully (cached)', cachedResponse.value);
    }

    // Build base WHERE conditions (without location)
    const baseConditions: string[] = ['b.status = ?'];
    const baseParams: any[] = [status];

    if (search) {
      baseConditions.push('(b.name LIKE ? OR b.description LIKE ?)');
      baseParams.push(`%${search}%`, `%${search}%`);
    }

    // Handle categoryIds
    if (categoryIds) {
      let idsArray: string[];
      
      if (typeof categoryIds === 'string') {
        idsArray = categoryIds.split(',');
      } else if (Array.isArray(categoryIds)) {
        idsArray = categoryIds.map(id => String(id));
      } else {
        idsArray = [categoryIds as unknown as string];
      }
      
      const placeholders = idsArray.map(() => '?').join(',');
      baseConditions.push(`b.categoryId IN (${placeholders})`);
      baseParams.push(...idsArray);
    } else if (categoryId) {
      baseConditions.push('b.categoryId = ?');
      baseParams.push(categoryId);
    }

    if (isVerified !== undefined) {
      baseConditions.push('b.isVerified = ?');
      baseParams.push(isVerified === 'true' ? 1 : 0);
    }

    if (rating) {
      const minRating = parseFloat(rating as string);
      if (!Number.isNaN(minRating)) {
        baseConditions.push('b.averageRating >= ?');
        baseParams.push(minRating);
      }
    }

    // Build ORDER BY with promoted businesses first
    let orderByClause = '';
    switch (sortBy) {
      case 'rating_high':
        orderByClause = 'ORDER BY CASE WHEN b.promotedUntil > NOW() THEN 0 ELSE 1 END, b.averageRating DESC, b.createdAt DESC';
        break;
      case 'rating_low':
        orderByClause = 'ORDER BY CASE WHEN b.promotedUntil > NOW() THEN 0 ELSE 1 END, b.averageRating ASC, b.createdAt DESC';
        break;
      case 'oldest':
        orderByClause = 'ORDER BY CASE WHEN b.promotedUntil > NOW() THEN 0 ELSE 1 END, b.createdAt ASC';
        break;
      case 'verified':
        orderByClause = 'ORDER BY CASE WHEN b.promotedUntil > NOW() THEN 0 ELSE 1 END, b.isVerified DESC, b.createdAt DESC';
        break;
      case 'popular':
        orderByClause = 'ORDER BY CASE WHEN b.promotedUntil > NOW() THEN 0 ELSE 1 END, b.averageRating DESC, b.totalReviews DESC, b.createdAt DESC';
        break;
      case 'name_asc':
        orderByClause = 'ORDER BY CASE WHEN b.promotedUntil > NOW() THEN 0 ELSE 1 END, b.name ASC';
        break;
      case 'name_desc':
        orderByClause = 'ORDER BY CASE WHEN b.promotedUntil > NOW() THEN 0 ELSE 1 END, b.name DESC';
        break;
      default: // newest
        orderByClause = 'ORDER BY CASE WHEN b.promotedUntil > NOW() THEN 0 ELSE 1 END, b.createdAt DESC';
    }

    console.log('[DB] Executing query with fallback logic...');
    const queryStart = Date.now();

    let result: { countResult: [{ total: bigint }], businesses: any[] };
    let locationContext: {
      requested: { id: string; type: string; name: string } | null;
      applied: { id: string; type: string; name: string } | null;
      fallbackApplied: boolean;
    } | null = null;

    let requestedLocation: { id: string; type: string; name: string } | null = null;
    let cityInfo: any = null;
    let regionInfo: any = null;

    const effectiveCityId = (cityId as string) || (locationId && locationType === 'city' ? (locationId as string) : null);

    if (effectiveCityId) {
      cityInfo = await prismaClient.city.findUnique({
        where: { id: effectiveCityId },
        include: {
          region: {
            include: {
              country: true,
            },
          },
        },
      });

      if (cityInfo) {
        requestedLocation = {
          id: cityInfo.id,
          type: 'city',
          name: cityInfo.name,
        };

        // Try city first
        result = await executeBusinessQuery(
          baseConditions,
          baseParams,
          'b.cityId = ?',
          [effectiveCityId],
          orderByClause,
          take,
          skip
        );

        const total = Number(result.countResult[0]?.total || 0);

        // If no results, try region
        if (total === 0 && cityInfo.region) {
          const regionCityIds = await fetchRegionCityIds(cityInfo.region.id);
          if (regionCityIds.length > 0) {
            const placeholders = regionCityIds.map(() => '?').join(',');
            result = await executeBusinessQuery(
              baseConditions,
              baseParams,
              `b.cityId IN (${placeholders})`,
              regionCityIds,
              orderByClause,
              take,
              skip
            );

            const regionTotal = Number(result.countResult[0]?.total || 0);
            if (regionTotal > 0) {
              locationContext = {
                requested: requestedLocation,
                applied: {
                  id: cityInfo.region.id,
                  type: 'region',
                  name: cityInfo.region.name,
                },
                fallbackApplied: true,
              };
            } else {
              // If still no results, try country (all businesses)
              result = await executeBusinessQuery(
                baseConditions,
                baseParams,
                null,
                [],
                orderByClause,
                take,
                skip
              );

              const countryTotal = Number(result.countResult[0]?.total || 0);
              if (countryTotal > 0 && cityInfo.region.country) {
                locationContext = {
                  requested: requestedLocation,
                  applied: {
                    id: cityInfo.region.country.id,
                    type: 'country',
                    name: cityInfo.region.country.name,
                  },
                  fallbackApplied: true,
                };
              }
            }
          } else {
            // No cities in region, try country
            result = await executeBusinessQuery(
              baseConditions,
              baseParams,
              null,
              [],
              orderByClause,
              take,
              skip
            );

            const countryTotal = Number(result.countResult[0]?.total || 0);
            if (countryTotal > 0 && cityInfo.region.country) {
              locationContext = {
                requested: requestedLocation,
                applied: {
                  id: cityInfo.region.country.id,
                  type: 'country',
                  name: cityInfo.region.country.name,
                },
                fallbackApplied: true,
              };
            }
          }
        } else if (total > 0) {
          // Results found in city
          locationContext = {
            requested: requestedLocation,
            applied: requestedLocation,
            fallbackApplied: false,
          };
        }
      } else {
        // City not found, try without location filter
        result = await executeBusinessQuery(
          baseConditions,
          baseParams,
          null,
          [],
          orderByClause,
          take,
          skip
        );
      }
    } else if (locationId) {
      // Handle locationId (could be region)
      const locationHierarchy = await resolveLocationHierarchy(
        locationId as string,
        locationType as string
      );

      if (locationHierarchy) {
        requestedLocation = {
          id: locationHierarchy.requestedId,
          type: locationHierarchy.resolvedType,
          name: locationHierarchy.resolvedName,
        };

        // Try each level in hierarchy
        let found = false;
        for (const level of locationHierarchy.levels) {
          if (level.cityIds.length > 0) {
            const placeholders = level.cityIds.map(() => '?').join(',');
            result = await executeBusinessQuery(
              baseConditions,
              baseParams,
              `b.cityId IN (${placeholders})`,
              level.cityIds,
              orderByClause,
              take,
              skip
            );

            const total = Number(result.countResult[0]?.total || 0);
            if (total > 0) {
              locationContext = {
                requested: requestedLocation,
                applied: {
                  id: level.id,
                  type: level.type,
                  name: level.name,
                },
                fallbackApplied: level.type !== locationHierarchy.resolvedType,
              };
              found = true;
              break;
            }
          }
        }

        if (!found) {
          // Try country (all businesses)
          result = await executeBusinessQuery(
            baseConditions,
            baseParams,
            null,
            [],
            orderByClause,
            take,
            skip
          );

          const countryTotal = Number(result.countResult[0]?.total || 0);
          if (countryTotal > 0) {
            // Get country info
            const country = await prismaClient.country.findFirst();
            if (country) {
              locationContext = {
                requested: requestedLocation,
                applied: {
                  id: country.id,
                  type: 'country',
                  name: country.name,
                },
                fallbackApplied: true,
              };
            }
          }
        }
      } else {
        // Location not found, try without location filter
        result = await executeBusinessQuery(
          baseConditions,
          baseParams,
          null,
          [],
          orderByClause,
          take,
          skip
        );
      }
    } else {
      // No location specified, get all businesses
      result = await executeBusinessQuery(
        baseConditions,
        baseParams,
        null,
        [],
        orderByClause,
        take,
        skip
      );
    }

    console.log(`[DB] Query completed in ${Date.now() - queryStart}ms`);

    const total = Number(result.countResult[0]?.total || 0);

    // Transform raw results to match expected format
    const formattedBusinesses = result.businesses.map((row: any) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      email: row.email,
      phone: row.phone,
      whatsapp: row.whatsapp,
      website: row.website,
      address: row.address,
      latitude: row.latitude ? parseFloat(row.latitude) : null,
      longitude: row.longitude ? parseFloat(row.longitude) : null,
      images: row.images ? (typeof row.images === 'string' ? JSON.parse(row.images) : row.images) : null,
      logo: row.logo,
      logoAlt: row.logoAlt,
      coverImage: row.coverImage,
      coverImageAlt: row.coverImageAlt,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
      keywords: row.keywords ? (typeof row.keywords === 'string' ? JSON.parse(row.keywords) : row.keywords) : null,
      status: row.status,
      averageRating: parseFloat(row.averageRating) || 0,
      totalReviews: row.totalReviews || 0,
      workingHours: row.workingHours ? (typeof row.workingHours === 'string' ? JSON.parse(row.workingHours) : row.workingHours) : null,
      isVerified: Boolean(row.isVerified),
      promotedUntil: row.promotedUntil,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      category: row.category_id ? {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
        icon: row.category_icon,
      } : null,
      city: row.city_id ? {
        id: row.city_id,
        name: row.city_name,
        slug: row.city_slug,
        region: row.region_id ? {
          id: row.region_id,
          name: row.region_name,
          slug: row.region_slug,
        } : null
      } : null,
      user: row.user_id ? {
        id: row.user_id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.user_email,
      } : null
    }));

    const responsePayload: any = {
      businesses: formattedBusinesses,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };

    // Add location context if fallback was applied
    if (locationContext) {
      responsePayload.locationContext = locationContext;
    }

    // Cache the response
    businessCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value: responsePayload,
    });

    const requestDuration = Date.now() - requestStart;
    console.log(
      `[PERF] getAllBusinesses took ${requestDuration}ms (${formattedBusinesses.length} results)`
    );

    if (requestDuration > 1000) {
      console.warn('[PERF WARNING] Request took >1s despite optimization');
    }

    return sendSuccess(res, 200, 'Businesses fetched successfully', responsePayload);
  } catch (error) {
    console.error('Get businesses error:', error);
    return sendError(res, 500, 'Failed to fetch businesses', error);
  }
};

export const diagnosePerformance = async (req: Request, res: Response) => {
  const metrics: any = {
    timestamps: {},
    durations: {},
    queries: []
  };

  try {
    // 1. TEST: Simple SELECT 1 (measures pure connection overhead)
    metrics.timestamps.connectionTest_start = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    metrics.timestamps.connectionTest_end = performance.now();
    metrics.durations.connectionTest = metrics.timestamps.connectionTest_end - metrics.timestamps.connectionTest_start;

    // 2. TEST: Count query
    metrics.timestamps.countQuery_start = performance.now();
    const count = await prisma.business.count({ where: { status: 'APPROVED' } });
    metrics.timestamps.countQuery_end = performance.now();
    metrics.durations.countQuery = metrics.timestamps.countQuery_end - metrics.timestamps.countQuery_start;

    // 3. TEST: Simple fetch (1 business, no relations)
    metrics.timestamps.simpleFetch_start = performance.now();
    const simpleBusiness = await prisma.business.findFirst({
      where: { status: 'APPROVED' },
      select: { id: true, name: true, slug: true }
    });
    metrics.timestamps.simpleFetch_end = performance.now();
    metrics.durations.simpleFetch = metrics.timestamps.simpleFetch_end - metrics.timestamps.simpleFetch_start;

    // 4. TEST: Fetch with relations (this is what's killing you)
    metrics.timestamps.withRelations_start = performance.now();
    const businessWithRelations = await prisma.business.findFirst({
      where: { status: 'APPROVED' },
      include: {
        category: { select: { id: true, name: true, slug: true, icon: true } },
        city: {
          select: {
            id: true, name: true, slug: true,
            region: { select: { id: true, name: true, slug: true } }
          }
        },
        user: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });
    metrics.timestamps.withRelations_end = performance.now();
    metrics.durations.withRelations = metrics.timestamps.withRelations_end - metrics.timestamps.withRelations_start;

    // 5. TEST: Raw SQL join (bypass Prisma N+1)
    metrics.timestamps.rawSQL_start = performance.now();
    const rawResult = await prisma.$queryRaw`
      SELECT 
        b.id, b.name, b.slug,
        c.id as category_id, c.name as category_name,
        ci.id as city_id, ci.name as city_name,
        r.id as region_id, r.name as region_name,
        u.id as user_id, u.firstName
      FROM Business b
      LEFT JOIN Category c ON b.categoryId = c.id
      LEFT JOIN City ci ON b.cityId = ci.id
      LEFT JOIN Region r ON ci.regionId = r.id
      LEFT JOIN User u ON b.userId = u.id
      WHERE b.status = 'APPROVED'
      LIMIT 1
    `;
    metrics.timestamps.rawSQL_end = performance.now();
    metrics.durations.rawSQL = metrics.timestamps.rawSQL_end - metrics.timestamps.rawSQL_start;

    // 6. TEST: Parallel queries vs Sequential
    metrics.timestamps.sequential_start = performance.now();
    const cat1 = await prisma.category.findFirst();
    const city1 = await prisma.city.findFirst();
    const user1 = await prisma.user.findFirst();
    metrics.timestamps.sequential_end = performance.now();
    metrics.durations.sequential = metrics.timestamps.sequential_end - metrics.timestamps.sequential_start;

    metrics.timestamps.parallel_start = performance.now();
    await Promise.all([
      prisma.category.findFirst(),
      prisma.city.findFirst(),
      prisma.user.findFirst()
    ]);
    metrics.timestamps.parallel_end = performance.now();
    metrics.durations.parallel = metrics.timestamps.parallel_end - metrics.timestamps.parallel_start;

    // 7. DATABASE LOCATION TEST
    const dbInfo = await prisma.$queryRaw`
      SELECT 
        @@hostname as hostname,
        @@version as version,
        @@datadir as datadir
    `;

    // Calculate network overhead
    const durationValues = Object.values(metrics.durations) as number[];
    const avgQueryTime = durationValues.reduce((a, b) => a + b, 0) / durationValues.length;
    
    metrics.analysis = {
      avgQueryTime,
      networkOverheadEstimate: metrics.durations.connectionTest,
      n1Problem: metrics.durations.withRelations - metrics.durations.rawSQL,
      parallelBenefit: metrics.durations.sequential - metrics.durations.parallel,
      recommendations: []
    };

    // Generate recommendations
    if (metrics.durations.connectionTest > 200) {
      metrics.analysis.recommendations.push({
        severity: 'CRITICAL',
        issue: 'High network latency',
        description: `Each query has ${Math.round(metrics.durations.connectionTest)}ms overhead`,
        solutions: [
          'Move database closer to application server (same region)',
          'Use connection pooling',
          'Enable database read replicas in same region as app'
        ]
      });
    }

    if (metrics.analysis.n1Problem > 200) {
      metrics.analysis.recommendations.push({
        severity: 'HIGH',
        issue: 'N+1 query problem',
        description: `Prisma is making ${Math.round(metrics.analysis.n1Problem)}ms extra queries for relations`,
        solutions: [
          'Use raw SQL with JOINs instead of Prisma includes',
          'Implement dataloader pattern',
          'Use Prisma relationLoadStrategy: "join" (Prisma 5.14+)'
        ]
      });
    }

    if (metrics.durations.parallel < metrics.durations.sequential * 0.8) {
      metrics.analysis.recommendations.push({
        severity: 'MEDIUM',
        issue: 'Sequential queries detected',
        description: 'Running queries in parallel could save time',
        solutions: [
          'Use Promise.all() for independent queries',
          'Batch related queries together'
        ]
      });
    }

    return res.json({
      success: true,
      metrics,
      dbInfo,
      summary: {
        connectionOverhead: `${Math.round(metrics.durations.connectionTest)}ms`,
        singleQueryAvg: `${Math.round(metrics.analysis.avgQueryTime)}ms`,
        withRelations: `${Math.round(metrics.durations.withRelations)}ms`,
        rawSQLJoin: `${Math.round(metrics.durations.rawSQL)}ms`,
        improvement: `${Math.round(((metrics.durations.withRelations - metrics.durations.rawSQL) / metrics.durations.withRelations) * 100)}% faster with raw SQL`
      }
    });

  } catch (error) {
    console.error('Diagnostic error:', error);
    return res.status(500).json({ success: false, error: error.message, metrics });
  }
};

// Get all businesses for admin (all statuses)
export const getAllBusinessesAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '10', status, search } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};

    // Add status filter
    if (status) {
      where.status = status;
    }

    // Add search functionality
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const searchTerm = search.trim();
      const searchConditions: any[] = [
        { name: { contains: searchTerm } },
        { description: { contains: searchTerm } },
        { 
          user: {
            OR: [
              { firstName: { contains: searchTerm } },
              { lastName: { contains: searchTerm } },
              { email: { contains: searchTerm } },
            ],
          },
        },
        { 
          city: {
            name: { contains: searchTerm },
          },
        },
      ];

      // If we already have a status filter, combine with AND
      if (where.status) {
        where.AND = [
          { status: where.status },
          { OR: searchConditions },
        ];
        delete where.status;
      } else {
        where.OR = searchConditions;
      }
    }

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        include: {
          category: true,
          city: {
            include: { region: true },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.business.count({ where }),
    ]);

    return sendSuccess(res, 200, 'Businesses fetched successfully', {
      businesses,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get businesses error:', error);
    return sendError(res, 500, 'Failed to fetch businesses', error);
  }
};

// Get single business by ID
export const getBusinessById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const business = await prisma.business.findUnique({
      where: { id },
      include: {
        category: true,
        city: {
          include: { region: true },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        services: true,
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    return sendSuccess(res, 200, 'Business fetched successfully', business);
  } catch (error) {
    console.error('Get business error:', error);
    return sendError(res, 500, 'Failed to fetch business', error);
  }
};

// Get business by slug
export const getBusinessBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const business = await prisma.business.findUnique({
      where: { slug },
      include: {
        category: true,
        city: {
          include: { region: true },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        services: true,
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    return sendSuccess(res, 200, 'Business fetched successfully', business);
  } catch (error) {
    console.error('Get business error:', error);
    return sendError(res, 500, 'Failed to fetch business', error);
  }
};

// Create business (Business Owner/Admin)
export const createBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const {
      name,
      slug,
      description,
      email,
      phone,
      whatsapp,
      website,
      address,
      latitude,
      longitude,
      categoryId,
      cityId,
      crNumber,
      workingHours,
      metaTitle,
      metaDescription,
      keywords,
      logoAlt,
      coverImageAlt,
      imageAlts, // JSON string array of alt tags for gallery images
    } = req.body;

    if (!name || !slug || !email || !phone || !address || !categoryId || !cityId) {
      return sendError(res, 400, 'Required fields are missing');
    }

    const existingBusiness = await prisma.business.findUnique({
      where: { slug },
    });

    if (existingBusiness) {
      return sendError(res, 409, 'Business with this slug already exists');
    }

    // Handle file uploads
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    let logo = null;
    let coverImage = null;
    let images: Array<{ url: string; alt: string }> = [];

    if (files) {
      if (files.logo && files.logo[0]) {
        logo = await uploadToCloudinary(files.logo[0], 'businesses/logos');
      }

      if (files.coverImage && files.coverImage[0]) {
        coverImage = await uploadToCloudinary(files.coverImage[0], 'businesses/covers');
      }

      if (files.images && files.images.length > 0) {
        let parsedImageAlts: string[] = [];
        if (imageAlts) {
          try {
            parsedImageAlts = typeof imageAlts === 'string' ? JSON.parse(imageAlts) : imageAlts;
          } catch (e) {
            console.error('Image alt tags parse error:', e);
          }
        }
        
        const imageUploads = await Promise.all(
          files.images.map(async (file, index) => {
            const url = await uploadToCloudinary(file, 'businesses/gallery');
            return {
              url,
              alt: parsedImageAlts[index] || '',
            };
          })
        );
        images = imageUploads;
      }
    }

    // Parse working hours properly
    let parsedWorkingHours = null;
    if (workingHours) {
      try {
        parsedWorkingHours = typeof workingHours === 'string'
          ? JSON.parse(workingHours)
          : workingHours;
      } catch (e) {
        console.error('Working hours parse error:', e);
      }
    }

    // Parse keywords properly
    let parsedKeywords = null;
    if (keywords) {
      try {
        parsedKeywords = typeof keywords === 'string'
          ? JSON.parse(keywords)
          : keywords;
      } catch (e) {
        console.error('Keywords parse error:', e);
      }
    }

    const business = await prisma.business.create({
      data: {
        name,
        slug,
        description,
        email,
        phone,
        whatsapp,
        website,
        address,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        categoryId,
        cityId,
        userId: userId!,
        crNumber,
        workingHours: parsedWorkingHours,
        metaTitle,
        metaDescription,
        keywords: parsedKeywords,
        logo,
        logoAlt: logoAlt || null,
        coverImage,
        coverImageAlt: coverImageAlt || null,
        images: images.length > 0 ? images : null,
        status: 'PENDING',
      } as any,
      include: {
        category: true,
        city: true,
      },
    });

    return sendSuccess(res, 201, 'Business created successfully', business);
  } catch (error) {
    console.error('Create business error:', error);

    // Cleanup uploaded files on error

    return sendError(res, 500, 'Failed to create business', error);
  }
};

// Update business (Owner/Admin)
export const updateBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const existingBusiness = await prisma.business.findUnique({
      where: { id },
    });

    if (!existingBusiness) {
      return sendError(res, 404, 'Business not found');
    }

    if (existingBusiness.userId !== userId && userRole !== 'ADMIN') {
      return sendError(res, 403, 'You are not authorized to update this business');
    }

    const {
      name,
      slug,
      description,
      email,
      phone,
      whatsapp,
      website,
      address,
      latitude,
      longitude,
      categoryId,
      cityId,
      crNumber,
      workingHours,
      metaTitle,
      metaDescription,
      keywords,
      logoAlt,
      coverImageAlt,
      imageAlts, // JSON string array of alt tags for gallery images
    } = req.body;

    // Handle file uploads
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const updateData: any = {
      name,
      slug,
      description,
      email,
      phone,
      whatsapp,
      website,
      address,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      categoryId,
      cityId,
      crNumber,
      workingHours: workingHours ? JSON.parse(workingHours) : undefined,
      metaTitle,
      metaDescription,
      keywords: keywords ? JSON.parse(keywords) : undefined,
      logoAlt: logoAlt !== undefined ? (logoAlt || null) : undefined,
      coverImageAlt: coverImageAlt !== undefined ? (coverImageAlt || null) : undefined,
    };

    if (files) {
      if (files.logo && files.logo[0]) {
        updateData.logo = await uploadToCloudinary(files.logo[0], 'businesses/logos');
      }

      if (files.coverImage && files.coverImage[0]) {
        updateData.coverImage = await uploadToCloudinary(files.coverImage[0], 'businesses/covers');
      }

      if (files && files.images && files.images.length > 0) {
        let parsedImageAlts: string[] = [];
        if (imageAlts) {
          try {
            parsedImageAlts = typeof imageAlts === 'string' ? JSON.parse(imageAlts) : imageAlts;
          } catch (e) {
            console.error('Image alt tags parse error:', e);
          }
        }
        
        const imageUploads = await Promise.all(
          files.images.map(async (file, index) => {
            const url = await uploadToCloudinary(file, 'businesses/gallery');
            return {
              url,
              alt: parsedImageAlts[index] || '',
            };
          })
        );

        // Get existing images - handle both old format (string[]) and new format (object[])
        const existingImagesRaw = existingBusiness.images || [];
        const existingImages = Array.isArray(existingImagesRaw) 
          ? existingImagesRaw.map((img: any) => 
              typeof img === 'string' ? { url: img, alt: '' } : img
            )
          : [];

        updateData.images = [...existingImages, ...imageUploads];
      } else if (imageAlts) {
        // Update alt tags for existing images even if no new files are uploaded
        let parsedImageAlts: string[] = [];
        try {
          parsedImageAlts = typeof imageAlts === 'string' ? JSON.parse(imageAlts) : imageAlts;
        } catch (e) {
          console.error('Image alt tags parse error:', e);
        }
        
        if (parsedImageAlts.length > 0) {
          const existingImagesRaw = existingBusiness.images || [];
          const existingImages = Array.isArray(existingImagesRaw) 
            ? existingImagesRaw.map((img: any, index: number) => {
                const alt = parsedImageAlts[index] || '';
                return typeof img === 'string' ? { url: img, alt } : { ...img, alt };
              })
            : [];
          updateData.images = existingImages;
        }
      }
    }

    const business = await prisma.business.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        city: true,
      },
    });

    return sendSuccess(res, 200, 'Business updated successfully', business);
  } catch (error) {
    console.error('Update business error:', error);



    return sendError(res, 500, 'Failed to update business', error);
  }
};

// Delete business (Owner/Admin)
export const deleteBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const existingBusiness = await prisma.business.findUnique({
      where: { id },
    });

    if (!existingBusiness) {
      return sendError(res, 404, 'Business not found');
    }

    if (existingBusiness.userId !== userId && userRole !== 'ADMIN') {
      return sendError(res, 403, 'You are not authorized to delete this business');
    }

    await prisma.business.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'Business deleted successfully');
  } catch (error) {
    console.error('Delete business error:', error);
    return sendError(res, 500, 'Failed to delete business', error);
  }
};

// Get businesses by current user
export const getMyBusinesses = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const businesses = await prisma.business.findMany({
      where: { userId },
      include: {
        category: true,
        city: true,
        reviews: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Your businesses fetched successfully', businesses);
  } catch (error) {
    console.error('Get my businesses error:', error);
    return sendError(res, 500, 'Failed to fetch your businesses', error);
  }
};

// Approve business (Admin only)
export const approveBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const business = await prisma.business.update({
      where: { id },
      data: {
        status: 'APPROVED',
        isVerified: true,
      },
    });

    // Create notification for business owner
    await prisma.notification.create({
      data: {
        userId: business.userId,
        type: 'BUSINESS_APPROVED',
        title: 'Business Approved! 🎉',
        message: `Your business "${business.name}" has been approved and is now live!`,
        link: `/dashboard/my-listings`,
      },
    });

    return sendSuccess(res, 200, 'Business approved successfully', business);
  } catch (error) {
    console.error('Approve business error:', error);
    return sendError(res, 500, 'Failed to approve business', error);
  }
};

// Reject business (Admin only)
export const rejectBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body; // Optional rejection reason

    const business = await prisma.business.update({
      where: { id },
      data: { status: 'REJECTED' },
    });

    // Create notification for business owner
    await prisma.notification.create({
      data: {
        userId: business.userId,
        type: 'BUSINESS_REJECTED',
        title: 'Business Rejected',
        message: `Your business "${business.name}" has been rejected. ${reason ? `Reason: ${reason}` : 'Please contact support for more details.'}`,
        link: `/dashboard/my-listings`,
      },
    });

    return sendSuccess(res, 200, 'Business rejected successfully', business);
  } catch (error) {
    console.error('Reject business error:', error);
    return sendError(res, 500, 'Failed to reject business', error);
  }
};

// Add service to business
export const addService = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const userId = req.user?.userId;
    const { name, description, price, duration, youtubeUrl } = req.body;

    if (!name || !price) {
      return sendError(res, 400, 'Name and price are required');
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return sendError(res, 404, 'Business not found');
    }

    if (business.userId !== userId && req.user?.role !== 'ADMIN') {
      return sendError(res, 403, 'You are not authorized to add services to this business');
    }

    // Handle image upload
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    let image = null;

    if (files && files.image && files.image[0]) {
      image = await uploadToCloudinary(files.image[0], 'services');
    }

    const service = await prisma.service.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        duration: duration ? parseInt(duration as string, 10) : null,
        image,
        youtubeUrl: youtubeUrl || null,
        businessId,
      } as any,
    });

    return sendSuccess(res, 201, 'Service added successfully', service);
  } catch (error) {
    console.error('Add service error:', error);
    return sendError(res, 500, 'Failed to add service', error);
  }
};

// Get services by business
export const getBusinessServices = async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;

    const services = await prisma.service.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Services fetched successfully', services);
  } catch (error) {
    console.error('Get services error:', error);
    return sendError(res, 500, 'Failed to fetch services', error);
  }
};

// Update service
export const updateService = async (req: AuthRequest, res: Response) => {
  try {
    const { serviceId } = req.params;
    const userId = req.user?.userId;
    const { name, description, price, duration, youtubeUrl } = req.body;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { business: true },
    });

    if (!service) {
      return sendError(res, 404, 'Service not found');
    }

    if (service.business.userId !== userId && req.user?.role !== 'ADMIN') {
      return sendError(res, 403, 'You are not authorized to update this service');
    }

    // Handle image upload
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const updateData: any = {
      name,
      description,
      price: price ? parseFloat(price) : undefined,
      duration: duration ? parseInt(duration as string, 10) : undefined,
      youtubeUrl: youtubeUrl !== undefined ? (youtubeUrl || null) : undefined,
    };

    if (files && files.image && files.image[0]) {
      updateData.image = await uploadToCloudinary(files.image[0], 'services');
    }

    const updatedService = await prisma.service.update({
      where: { id: serviceId },
      data: updateData as any,
    });

    return sendSuccess(res, 200, 'Service updated successfully', updatedService);
  } catch (error) {
    console.error('Update service error:', error);
    return sendError(res, 500, 'Failed to update service', error);
  }
};

// Delete service
export const deleteService = async (req: AuthRequest, res: Response) => {
  try {
    const { serviceId } = req.params;
    const userId = req.user?.userId;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { business: true },
    });

    if (!service) {
      return sendError(res, 404, 'Service not found');
    }

    if (service.business.userId !== userId && req.user?.role !== 'ADMIN') {
      return sendError(res, 403, 'You are not authorized to delete this service');
    }

    await prisma.service.delete({
      where: { id: serviceId },
    });

    return sendSuccess(res, 200, 'Service deleted successfully');
  } catch (error) {
    console.error('Delete service error:', error);
    return sendError(res, 500, 'Failed to delete service', error);
  }
};

// Unified search endpoint for both businesses and categories
// Unified search endpoint for both businesses and categories
export const unifiedSearch = async (req: Request, res: Response) => {
  try {
    const { query, cityId, limit = '10' } = req.query;

    if (!query || (query as string).length < 2) {
      return sendError(res, 400, 'Search query must be at least 2 characters');
    }

    const searchTerm = query as string;
    const searchLimit = parseInt(limit as string);

    // Search categories (remove mode: 'insensitive' for MySQL)
    const categories = await prisma.category.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm } },
          { description: { contains: searchTerm } },
        ],
      },
      take: searchLimit,
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        description: true,
      },
    });

    // Search businesses (remove mode: 'insensitive' and fix select/include)
    const businessWhere: any = {
      status: 'APPROVED',
      OR: [
        { name: { contains: searchTerm } },
        { description: { contains: searchTerm } },
      ],
    };

    if (cityId) {
      businessWhere.cityId = cityId;
    }

    const businesses = await prisma.business.findMany({
      where: businessWhere,
      take: searchLimit,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logo: true,
        averageRating: true,
        totalReviews: true,
        isVerified: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        city: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return sendSuccess(res, 200, 'Search results fetched successfully', {
      categories: categories.map(cat => ({ ...cat, type: 'category' })),
      businesses: businesses.map(bus => ({ ...bus, type: 'business' })),
      query: searchTerm,
    });
  } catch (error) {
    console.error('Unified search error:', error);
    return sendError(res, 500, 'Failed to perform search', error);
  }
};

// Add this export at the end of the file, before the last export

// Get featured/trending businesses
export const getFeaturedBusinesses = async (req: Request, res: Response) => {
  try {
    const { limit = '8', cityId, locationId, locationType } = req.query;

    const baseWhere: any = {
      status: 'APPROVED',
      isVerified: true,
    };

    const resolvedLocationId =
      typeof locationId === 'string' && locationId.trim().length > 0
        ? locationId
        : typeof cityId === 'string' && cityId.trim().length > 0
        ? cityId
        : null;

    const resolvedLocationType =
      typeof locationType === 'string' ? locationType : undefined;

    const includeConfig = {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            icon: true,
          },
        },
        city: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
    };

    const buildWhereWithCityIds = (cityIds?: string[]) => {
      const whereClause = { ...baseWhere };
      if (cityIds && cityIds.length > 0) {
        whereClause.cityId =
          cityIds.length === 1 ? cityIds[0] : { in: Array.from(new Set(cityIds)) };
      }
      return whereClause;
    };

    const fetchFeaturedByCityIds = async (cityIds?: string[]) =>
      prisma.business.findMany({
        where: buildWhereWithCityIds(cityIds),
        include: includeConfig,
        orderBy: [
          { averageRating: 'desc' },
          { totalReviews: 'desc' },
          { createdAt: 'desc' },
        ],
        take: parseInt(limit as string),
      });

    let locationHierarchy: LocationHierarchyResult | null = null;
    if (resolvedLocationId) {
      locationHierarchy = await resolveLocationHierarchy(
        resolvedLocationId,
        resolvedLocationType
      );
    }

    let appliedLocationLevel: LocationLevel | null = null;
    const businesses =
      locationHierarchy && locationHierarchy.levels.length > 0
        ? await (async () => {
            for (const level of locationHierarchy!.levels) {
              if (!level.cityIds.length) {
                continue;
              }
              const result = await fetchFeaturedByCityIds(level.cityIds);
              if (result.length > 0) {
                appliedLocationLevel = level;
                return result;
              }
            }
            return await fetchFeaturedByCityIds();
          })()
        : await fetchFeaturedByCityIds();

    const locationContext = locationHierarchy
      ? {
          requested: {
            id: locationHierarchy.requestedId,
            type: locationHierarchy.resolvedType,
            name: locationHierarchy.resolvedName,
          },
          applied: appliedLocationLevel
            ? {
                id: appliedLocationLevel.id,
                type: appliedLocationLevel.type,
                name: appliedLocationLevel.name,
              }
            : null,
          fallbackApplied:
            !!appliedLocationLevel &&
            appliedLocationLevel.type !== locationHierarchy.resolvedType,
        }
      : undefined;

    return sendSuccess(res, 200, 'Featured businesses fetched successfully', {
      businesses,
      ...(locationContext ? { locationContext } : {}),
    });
  } catch (error) {
    console.error('Get featured businesses error:', error);
    return sendError(res, 500, 'Failed to fetch featured businesses', error);
  }
};

export const trackBusinessView = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';

    // Check if this IP viewed in last hour
    const recentView = await prisma.businessView.findFirst({
      where: {
        businessId: id,
        ipAddress,
        viewedAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000)
        }
      }
    });

    if (!recentView) {
      await prisma.businessView.create({
        data: {
          businessId: id,
          ipAddress
        }
      });
    }

    return res.json({
      success: true,
      message: 'View tracked successfully'
    });
  } catch (error) {
    console.error('Track view error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to track view'
    });
  }
};

export const getBusinessAnalytics = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Total views
    const totalViews = await prisma.businessView.count({
      where: { businessId: id }
    });

    // Today's views
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayViews = await prisma.businessView.count({
      where: {
        businessId: id,
        viewedAt: { gte: todayStart }
      }
    });

    // Last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const last7DaysViews = await prisma.businessView.groupBy({
      by: ['viewedAt'],
      where: {
        businessId: id,
        viewedAt: { gte: sevenDaysAgo }
      },
      _count: true
    });

    // Format last 7 days data
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      const dayViews = last7DaysViews.filter(v =>
        v.viewedAt.toISOString().split('T')[0] === dateString
      );

      last7Days.push({
        date: dateString,
        count: dayViews.length
      });
    }

    // Last 30 days (similar logic)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const last30DaysViews = await prisma.businessView.groupBy({
      by: ['viewedAt'],
      where: {
        businessId: id,
        viewedAt: { gte: thirtyDaysAgo }
      },
      _count: true
    });

    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      const dayViews = last30DaysViews.filter(v =>
        v.viewedAt.toISOString().split('T')[0] === dateString
      );

      last30Days.push({
        date: dateString,
        count: dayViews.length
      });
    }

    return res.json({
      success: true,
      data: {
        totalViews,
        todayViews,
        last7Days,
        last30Days
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get analytics'
    });
  }
};

export const getMyBusinessesServices = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const businesses = await prisma.business.findMany({
      where: {
        userId,
        services: {
          some: {}, // Only businesses that have at least one service
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        services: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Services fetched successfully', businesses);
  } catch (error) {
    console.error('Get my businesses services error:', error);
    return sendError(res, 500, 'Failed to fetch services', error);
  }
};

// Get all reviews received on user's businesses
export const getMyBusinessesReviews = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Get user's business IDs
    const businesses = await prisma.business.findMany({
      where: { userId },
      select: { id: true }
    });

    const businessIds = businesses.map(b => b.id);

    // Get all reviews for these businesses
    const reviews = await prisma.review.findMany({
      where: {
        businessId: { in: businessIds }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        },
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return sendSuccess(res, 200, 'Reviews fetched successfully', reviews);
  } catch (error) {
    console.error('Get my businesses reviews error:', error);
    return sendError(res, 500, 'Failed to fetch reviews', error);
  }
};