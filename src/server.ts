import app from './app';
import prisma from './config/database';
import { initializeCronJobs, startCronJobs } from './utils/cron';

const PORT = process.env.PORT || 5000;
const ENABLE_CRON_JOBS = process.env.ENABLE_CRON_JOBS === 'true';

const startServer = async () => {
  try {
    // Test database connection with a simple query
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connected successfully');
    
    // Log connection pool info if available
    const dbUrl = process.env.DATABASE_URL || '';
    if (dbUrl.includes('connection_limit')) {
      console.log('✅ Connection pooling configured in DATABASE_URL');
    } else {
      console.warn('⚠️  Consider adding connection_limit to DATABASE_URL to prevent connection exhaustion');
      console.warn('   Example: mysql://user:pass@host:3306/db?connection_limit=5&pool_timeout=20');
    }

    initializeCronJobs();

    if (ENABLE_CRON_JOBS) {
      startCronJobs();
      console.log('📅 Cron jobs are ENABLED');
    } else {
      console.log('📅 Cron jobs are DISABLED (set ENABLE_CRON_JOBS=true to enable)');
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 Test subscription expiry: http://localhost:${PORT}/api/subscriptions/check/expiring`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏳ Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();