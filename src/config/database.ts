import { PrismaClient } from '@prisma/client';

// Global singleton pattern for serverless environments (Vercel, AWS Lambda, etc.)
// This ensures we reuse the same Prisma Client instance across function invocations
// CRITICAL: Prevents "Too many connections" errors on shared hosting MySQL
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

// Validate DATABASE_URL has connection pooling parameters
const dbUrl = process.env.DATABASE_URL || '';
const hasConnectionLimit = dbUrl.includes('connection_limit');

if (!hasConnectionLimit && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  WARNING: DATABASE_URL missing connection_limit parameter!');
  console.warn('   This can cause "max_connections_per_hour" errors in production.');
  console.warn('   Add ?connection_limit=2&pool_timeout=20&connect_timeout=10 to your DATABASE_URL');
}

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
    // IMPORTANT: Add connection_limit parameter to DATABASE_URL in .env
    // Example: mysql://user:pass@host:3306/db?connection_limit=2&pool_timeout=20&connect_timeout=10
    // For serverless environments, use connection_limit=2 (very conservative) to stay under limits
  });

// Store the instance globally to reuse across invocations
// CRITICAL: This prevents creating multiple Prisma instances in serverless environments
// Without this, Vercel/Lambda creates new connections on every function invocation
// which exhausts shared hosting MySQL connection limits (usually 5-10 connections)
globalForPrisma.prisma = prisma;

// Ensure connection is established lazily and reused
// Prisma Client uses connection pooling internally, so connections are automatically reused
// The singleton pattern ensures the same Prisma instance (and its connection pool) is reused
// across all function invocations within the same container/warm instance

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
  if (!e.message?.includes("Can't reach database server") && 
      !e.message?.includes('P1001') && 
      !e.message?.includes('P1017') &&
      !e.message?.includes('Connection closed') &&
      !e.message?.includes('max_connections_per_hour') &&
      !e.message?.includes('exceeded')) {
    console.error('Prisma Client Error:', e);
  }
});

// Connection retry wrapper (OPTIMIZED - no health checks to save connections)
export const withConnectionRetry = async <T>(
  operation: () => Promise<T>,
  retries = 1, // Reduced from 2 to 1 to save connections
  delay = 1000 // Increased delay to reduce retry frequency
): Promise<T> => {
  for (let i = 0; i <= retries; i++) {
    try {
      // CRITICAL: Don't check connection health - it wastes connections!
      // Prisma Client handles connection pooling internally
      // Just execute the operation directly
      return await operation();
    } catch (error: any) {
      // If it's a connection error and we have retries left, try again
      // Also handle max_connections_per_hour errors
      const isConnectionError = 
        error.message?.includes("Can't reach database server") ||
        error.code === 'P1001' ||
        error.code === 'P1017' ||
        error.code === 'P2024' ||
        error.message?.includes('max_connections_per_hour') ||
        error.message?.includes('exceeded') ||
        error.message?.includes('ERROR 42000');
      
      if (isConnectionError && i < retries) {
        console.warn(`Database operation failed, retrying (attempt ${i + 1}/${retries})...`, error.message?.substring(0, 100));
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Database operation failed after retries');
};

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