import { Request, Response } from 'express';
import prisma from '../config/database';

const prismaClient = prisma as any;

const SITEMAP_MAX_URLS_PER_FILE = 1000;
const SITEMAP_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type SitemapUrl = {
  loc: string;
  lastmod: string;
};

type SitemapChunk = {
  xml: string;
  urlCount: number;
  generatedAtIso: string;
};

type SitemapCache = {
  generatedAt: number;
  generatedAtIso: string;
  indexXml: string;
  chunks: SitemapChunk[];
};

let sitemapCache: SitemapCache | null = null;
let sitemapGenerationPromise: Promise<SitemapCache> | null = null;

const nowIsoString = () => new Date().toISOString();

const getBaseUrl = () => {
  const base =
    process.env.SITEMAP_BASE_URL ||
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    'http://localhost:3000';

  return base.endsWith('/') ? base.slice(0, -1) : base;
};

const normalisePath = (path: string) => (path.startsWith('/') ? path : `/${path}`);

const buildAbsoluteUrl = (path: string) => `${getBaseUrl()}${normalisePath(path)}`;

const toIsoString = (value?: Date | string | null): string => {
  if (!value) {
    return nowIsoString();
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return nowIsoString();
  }

  return date.toISOString();
};

const mostRecentDateIso = (values: Array<Date | string | null | undefined>) => {
  const timestamps = values
    .filter((value) => Boolean(value))
    .map((value) => {
      const date = value instanceof Date ? value : new Date(value as string);
      return date.getTime();
    })
    .filter((timestamp) => !Number.isNaN(timestamp));

  if (!timestamps.length) {
    return nowIsoString();
  }

  return new Date(Math.max(...timestamps)).toISOString();
};

const generateSitemapXml = (urls: SitemapUrl[]) => {
  const urlEntries = urls
    .map(
      ({ loc, lastmod }) => `
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`.trim()
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
};

const generateIndexXml = (chunkCount: number, generatedAtIso: string) => {
  const baseUrl = getBaseUrl();
  const sitemapEntries = Array.from({ length: chunkCount }, (_, index) => {
    const loc = `${baseUrl}/sitemap-${index + 1}.xml`;
    return `
  <sitemap>
    <loc>${loc}</loc>
    <lastmod>${generatedAtIso}</lastmod>
  </sitemap>`.trim();
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</sitemapindex>`;
};

const collectSitemapUrls = async (): Promise<SitemapUrl[]> => {
  const generatedAtIso = nowIsoString();
  const urls: SitemapUrl[] = [];
  const seen = new Map<string, { iso: string; timestamp: number }>();

  const addUrl = (path: string, lastmod?: Date | string | null) => {
    const loc = buildAbsoluteUrl(path);
    const iso = lastmod ? toIsoString(lastmod) : generatedAtIso;
    const timestamp = new Date(iso).getTime();
    const current = seen.get(loc);

    if (!current || timestamp > current.timestamp) {
      seen.set(loc, { iso, timestamp });
    }
  };

  const staticPaths = [
    '/',
    '/businesses',
    '/categories',
    '/blog',
    '/about',
    '/contact',
    '/register',
    '/terms',
    '/privacy',
  ];

  staticPaths.forEach((path) => addUrl(path));

  const [categories, cities, regions, businesses, blogs, blogCategories, siteSettings] =
    await Promise.all([
    prismaClient.category.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prismaClient.city.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prismaClient.region.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prismaClient.business.findMany({
      where: { status: 'APPROVED' },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prismaClient.blog.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prismaClient.blogCategory.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
      prismaClient.siteSettings.findMany({
        select: { key: true, updatedAt: true },
      }),
    ]);

  siteSettings.forEach((setting: any) => {
    const key = (setting.key || '').toLowerCase();
    const lastmod = setting.updatedAt;

    if (['terms', 'terms_and_conditions', 'terms_conditions'].includes(key)) {
      addUrl('/terms', lastmod);
      return;
    }

    if (['privacy', 'privacy_policy'].includes(key)) {
      addUrl('/privacy', lastmod);
    }
  });

  categories.forEach((category: any) => {
    addUrl(`/categories/${category.slug}`, category.updatedAt);
  });

  blogCategories.forEach((category: any) => {
    addUrl(`/blog/category/${category.slug}`, category.updatedAt);
  });

  blogs.forEach((blog: any) => {
    addUrl(`/blog/${blog.slug}`, blog.updatedAt);
  });

  businesses.forEach((business: any) => {
    addUrl(`/businesses/${business.slug}`, business.updatedAt);
  });

  cities.forEach((city: any) => {
    categories.forEach((category: any) => {
      const lastmod = mostRecentDateIso([city.updatedAt, category.updatedAt]);
      addUrl(`/${city.slug}/${category.slug}`, lastmod);
    });
  });

  regions.forEach((region: any) => {
    categories.forEach((category: any) => {
      const lastmod = mostRecentDateIso([region.updatedAt, category.updatedAt]);
      addUrl(`/${region.slug}/${category.slug}`, lastmod);
    });
  });

  seen.forEach(({ iso }, loc) => {
    urls.push({ loc, lastmod: iso });
  });

  urls.sort((a, b) => a.loc.localeCompare(b.loc));

  return urls;
};

const generateSitemapCache = async (): Promise<SitemapCache> => {
  const urls = await collectSitemapUrls();
  const generatedAtIso = nowIsoString();

  const chunks: SitemapChunk[] = [];

  for (let index = 0; index < urls.length; index += SITEMAP_MAX_URLS_PER_FILE) {
    const chunkUrls = urls.slice(index, index + SITEMAP_MAX_URLS_PER_FILE);
    chunks.push({
      xml: generateSitemapXml(chunkUrls),
      urlCount: chunkUrls.length,
      generatedAtIso,
    });
  }

  const cache: SitemapCache = {
    generatedAt: Date.now(),
    generatedAtIso,
    indexXml: generateIndexXml(chunks.length, generatedAtIso),
    chunks,
  };

  sitemapCache = cache;
  return cache;
};

const ensureSitemapCache = async (): Promise<SitemapCache> => {
  const now = Date.now();

  if (sitemapCache && now - sitemapCache.generatedAt < SITEMAP_CACHE_TTL_MS) {
    return sitemapCache;
  }

  if (!sitemapGenerationPromise) {
    sitemapGenerationPromise = generateSitemapCache()
      .catch((error) => {
        sitemapGenerationPromise = null;
        throw error;
      })
      .finally(() => {
        sitemapGenerationPromise = null;
      });
  }

  try {
    return await sitemapGenerationPromise!;
  } catch (error) {
    if (sitemapCache) {
      return sitemapCache;
    }
    throw error;
  }
};

export const getSitemapIndex = async (_req: Request, res: Response) => {
  try {
    const cache = await ensureSitemapCache();
    res.header('Content-Type', 'application/xml');
    res.send(cache.indexXml);
  } catch (error) {
    console.error('Sitemap index generation failed:', error);
    res.status(500).send('Failed to generate sitemap index');
  }
};

export const getSitemapChunk = async (req: Request, res: Response) => {
  try {
    const cache = await ensureSitemapCache();
    const indexParam = req.params.index;
    const chunkIndex = Number.parseInt(indexParam, 10) - 1;

    if (Number.isNaN(chunkIndex) || chunkIndex < 0 || chunkIndex >= cache.chunks.length) {
      return res.status(404).send('Sitemap chunk not found');
    }

    res.header('Content-Type', 'application/xml');
    res.send(cache.chunks[chunkIndex].xml);
  } catch (error) {
    console.error('Sitemap chunk generation failed:', error);
    res.status(500).send('Failed to generate sitemap chunk');
  }
};

