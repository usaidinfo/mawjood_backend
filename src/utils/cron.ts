/**
 * Cron Jobs Configuration
 * Handles scheduled tasks like checking expiring subscriptions
 */

import * as cron from 'node-cron';

interface CronJobInfo {
  task: cron.ScheduledTask;
  running: boolean;
}

let cronJobs: CronJobInfo[] = [];

/**
 * Initialize all cron jobs
 */
export const initializeCronJobs = () => {
  // Check expiring subscriptions daily at 9 AM
  const subscriptionCheckJob = cron.schedule('0 9 * * *', async () => {
    console.log('🕐 Running scheduled task: Check expiring subscriptions');
    try {
      const { default: axios } = await import('axios');
      const baseUrl = process.env.BACKEND_URL || 'http://localhost:5000';
      const response = await axios.get(`${baseUrl}/api/subscriptions/check/expiring`);
      console.log('✅ Subscription expiry check completed:', response.data);
    } catch (error: any) {
      console.error('❌ Error running subscription expiry check:', error.message);
    }
  }, {
    scheduled: false, // Don't start automatically
    timezone: 'Asia/Riyadh', // Saudi Arabia timezone
  });

  cronJobs.push({
    task: subscriptionCheckJob,
    running: false,
  });

  console.log('📅 Cron jobs initialized (not started - call startCronJobs() to enable)');
};

/**
 * Start all cron jobs
 */
export const startCronJobs = () => {
  cronJobs.forEach((jobInfo, index) => {
    jobInfo.task.start();
    jobInfo.running = true;
    console.log(`✅ Started cron job ${index + 1}`);
  });
  console.log(`🚀 All ${cronJobs.length} cron job(s) are now running`);
};

/**
 * Stop all cron jobs
 */
export const stopCronJobs = () => {
  cronJobs.forEach((jobInfo, index) => {
    jobInfo.task.stop();
    jobInfo.running = false;
    console.log(`⏸️ Stopped cron job ${index + 1}`);
  });
  console.log(`⏹️ All ${cronJobs.length} cron job(s) stopped`);
};

/**
 * Get status of all cron jobs
 */
export const getCronJobStatus = () => {
  return cronJobs.map((jobInfo, index) => ({
    index: index + 1,
    running: jobInfo.running,
  }));
};

