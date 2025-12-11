import { PrismaClient } from '@prisma/client';

// Global singleton pattern for serverless environments (Vercel, AWS Lambda, etc.)
// This ensures we reuse the same Prisma Client instance across function invocations
// CRITICAL: Prevents "Too many connections" errors on shared hosting MySQL
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

// Create or reuse existing Prisma Client instance
// In serverless (Vercel/Lambda), global object persists between warm invocations
// In regular Node.js, it prevents multiple instances during hot reload
const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    // Connection pool configuration for shared hosting
    // These settings help manage connections better
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Connection pool settings to prevent connection exhaustion
    // IMPORTANT: Also add connection_limit parameter to DATABASE_URL in .env
    // Example: mysql://user:pass@host:3306/db?connection_limit=5&pool_timeout=20
  });

// Store the instance globally to reuse across invocations
// CRITICAL: This prevents creating multiple Prisma instances in serverless environments
// Without this, Vercel/Lambda creates new connections on every function invocation
// which exhausts shared hosting MySQL connection limits (usually 5-10 connections)
globalForPrisma.prisma = prisma;

// Only set up query logging in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (event) => {
    if (event.duration > 200) {
      console.log(
        `[Prisma] ${event.duration}ms | ${event.query.substring(0, 200)}`
      );
    }
  });
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Handle connection errors gracefully
prisma.$on('error' as never, (e: any) => {
  // Only log non-connection errors to avoid spam
  if (!e.message?.includes("Can't reach database server")) {
    console.error('Prisma Client Error:', e);
  }
});

// Helper function to check database connectivity
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    return false;
  }
};

export default prisma;