/**
 * Cron Jobs Configuration
 * Handles scheduled tasks like checking expiring subscriptions, publishing blogs, syncing advertisements
 */

import * as cron from 'node-cron';

interface CronJobInfo {
  task: cron.ScheduledTask;
  running: boolean;
  name: string;
}

let cronJobs: CronJobInfo[] = [];

/**
 * Initialize all cron jobs
 */
export const initializeCronJobs = () => {
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:5000';

  // 1. Sync expired subscriptions - Run daily at 9 AM
  // Marks subscriptions as EXPIRED when their end date has passed
  const syncExpiredSubscriptionsJob = cron.schedule('0 9 * * *', async () => {
    console.log('🕐 Running scheduled task: Sync expired subscriptions');
    try {
      const { default: axios } = await import('axios');
      const response = await axios.get(`${baseUrl}/api/subscriptions/sync/expired`);
      console.log('✅ Expired subscriptions synced:', response.data);
    } catch (error: any) {
      console.error('❌ Error syncing expired subscriptions:', error.message);
    }
  }, {
    scheduled: false,
    timezone: 'Asia/Riyadh',
  });

  cronJobs.push({
    task: syncExpiredSubscriptionsJob,
    running: false,
    name: 'Sync Expired Subscriptions',
  });

  // 2. Check expiring subscriptions - Run daily at 9 AM
  // Sends reminder emails for subscriptions expiring in the next 7 days
  const subscriptionCheckJob = cron.schedule('0 9 * * *', async () => {
    console.log('🕐 Running scheduled task: Check expiring subscriptions');
    try {
      const { default: axios } = await import('axios');
      const response = await axios.get(`${baseUrl}/api/subscriptions/check/expiring`);
      console.log('✅ Subscription expiry check completed:', response.data);
    } catch (error: any) {
      console.error('❌ Error running subscription expiry check:', error.message);
    }
  }, {
    scheduled: false,
    timezone: 'Asia/Riyadh',
  });

  cronJobs.push({
    task: subscriptionCheckJob,
    running: false,
    name: 'Check Expiring Subscriptions',
  });

  // 3. Publish scheduled blogs - Run daily at 9 AM
  // Publishes blogs that were scheduled and their publish time has arrived
  const publishScheduledBlogsJob = cron.schedule('0 9 * * *', async () => {
    console.log('🕐 Running scheduled task: Publish scheduled blogs');
    try {
      const { default: axios } = await import('axios');
      const response = await axios.get(`${baseUrl}/api/blogs/publish/scheduled`);
      console.log('✅ Scheduled blogs published:', response.data);
    } catch (error: any) {
      console.error('❌ Error publishing scheduled blogs:', error.message);
    }
  }, {
    scheduled: false,
    timezone: 'Asia/Riyadh',
  });

  cronJobs.push({
    task: publishScheduledBlogsJob,
    running: false,
    name: 'Publish Scheduled Blogs',
  });

  // 4. Sync advertisement status - Run daily at 9 AM
  // Activates/deactivates advertisements based on their start/end dates
  const syncAdvertisementStatusJob = cron.schedule('0 9 * * *', async () => {
    console.log('🕐 Running scheduled task: Sync advertisement status');
    try {
      const { default: axios } = await import('axios');
      const response = await axios.get(`${baseUrl}/api/advertisements/sync/status`);
      console.log('✅ Advertisement status synced:', response.data);
    } catch (error: any) {
      console.error('❌ Error syncing advertisement status:', error.message);
    }
  }, {
    scheduled: false,
    timezone: 'Asia/Riyadh',
  });

  cronJobs.push({
    task: syncAdvertisementStatusJob,
    running: false,
    name: 'Sync Advertisement Status',
  });

  console.log(`📅 ${cronJobs.length} cron job(s) initialized (not started - call startCronJobs() to enable)`);
};

/**
 * Start all cron jobs
 */
export const startCronJobs = () => {
  cronJobs.forEach((jobInfo, index) => {
    jobInfo.task.start();
    jobInfo.running = true;
    console.log(`✅ Started cron job ${index + 1}: ${jobInfo.name}`);
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
    console.log(`⏸️ Stopped cron job ${index + 1}: ${jobInfo.name}`);
  });
  console.log(`⏹️ All ${cronJobs.length} cron job(s) stopped`);
};

/**
 * Get status of all cron jobs
 */
export const getCronJobStatus = () => {
  return cronJobs.map((jobInfo, index) => ({
    index: index + 1,
    name: jobInfo.name,
    running: jobInfo.running,
  }));
};

