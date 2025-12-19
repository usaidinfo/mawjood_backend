/**
 * Cron Jobs Configuration
 * Handles scheduled tasks like checking expiring subscriptions, publishing blogs, syncing advertisements
 * 
 * CRITICAL: These jobs call functions DIRECTLY instead of making HTTP requests
 * This prevents creating new Lambda instances on Vercel, saving database connections
 */

import * as cron from 'node-cron';
import prisma from '../config/database';

interface CronJobInfo {
  task: cron.ScheduledTask;
  running: boolean;
  name: string;
}

let cronJobs: CronJobInfo[] = [];

// Internal function: Sync expired subscriptions (no HTTP overhead)
const syncExpiredSubscriptionsInternal = async () => {
  try {
    const now = new Date();
    const expired = await prisma.businessSubscription.findMany({
      where: {
        status: 'ACTIVE',
        endsAt: { lt: now },
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        plan: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!expired.length) {
      return { processed: 0 };
    }

    const expiredIds = expired.map((item: any) => item.id);

    await prisma.businessSubscription.updateMany({
      where: { id: { in: expiredIds } },
      data: { status: 'EXPIRED' },
    });

    const businessUpdates = expired.map((item: any) =>
      prisma.business.update({
        where: { id: item.businessId },
        data: {
          currentSubscriptionId: null,
          canCreateAdvertisements: false,
          promotedUntil: null,
          isVerified: false,
        },
      })
    );

    // Create notifications for expired subscriptions
    const notifications = expired.map((item: any) =>
      prisma.notification.create({
        data: {
          userId: item.business.userId,
          type: 'SUBSCRIPTION_EXPIRED',
          title: 'Subscription Expired',
          message: `Your subscription to "${item.plan?.name || 'subscription plan'}" for "${item.business.name}" has expired. Your business is no longer featured. Renew your subscription to continue enjoying premium benefits.`,
          link: `/dashboard/subscriptions`,
        },
      })
    );

    await Promise.all([...businessUpdates, ...notifications]);

    return { processed: expired.length };
  } catch (error: any) {
    console.error('Sync expired subscriptions error:', error);
    throw error;
  }
};

// Internal function: Check expiring subscriptions (no HTTP overhead)
const checkExpiringSubscriptionsInternal = async () => {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const oneDayFromNow = new Date(now);
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

    const expiringSubscriptions = await prisma.businessSubscription.findMany({
      where: {
        status: 'ACTIVE',
        paymentReference: { not: null },
        endsAt: {
          gte: now,
          lte: sevenDaysFromNow,
        },
        NOT: {
          status: {
            in: ['PENDING', 'FAILED', 'CANCELLED', 'EXPIRED'],
          },
        },
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        plan: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!expiringSubscriptions.length) {
      return { processed: 0 };
    }

    let processed = 0;
    const notifications: any[] = [];

    for (const subscription of expiringSubscriptions) {
      const endsAt = new Date(subscription.endsAt);
      const daysUntilExpiry = Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let shouldNotify = false;
      let notificationMessage = '';

      // Check if we should notify (1, 3, or 7 days)
      if (daysUntilExpiry === 7) {
        shouldNotify = true;
        notificationMessage = `Your subscription for "${subscription.business.name}" expires in 7 days. Renew now to continue enjoying premium benefits.`;
      } else if (daysUntilExpiry === 3) {
        shouldNotify = true;
        notificationMessage = `Your subscription for "${subscription.business.name}" expires in 3 days. Renew now to avoid interruption.`;
      } else if (daysUntilExpiry === 1) {
        shouldNotify = true;
        notificationMessage = `Your subscription for "${subscription.business.name}" expires tomorrow! Renew now to keep your business featured.`;
      }

      if (shouldNotify) {
        notifications.push(
          prisma.notification.create({
            data: {
              userId: subscription.business.userId,
              type: 'SUBSCRIPTION_EXPIRING',
              title: 'Subscription Expiring Soon',
              message: notificationMessage,
              link: `/dashboard/subscriptions`,
            },
          })
        );
        processed++;
      }
    }

    if (notifications.length > 0) {
      await Promise.all(notifications);
    }

    return { processed };
  } catch (error: any) {
    console.error('Check expiring subscriptions error:', error);
    throw error;
  }
};

// Internal function: Publish scheduled blogs (no HTTP overhead)
const publishScheduledBlogsInternal = async () => {
  try {
    const now = new Date();

    // Fetch all published blogs (scheduled blogs have published=true)
    const blogs = await prisma.blog.findMany({
      where: {
        published: true,
      },
      select: {
        id: true,
        tags: true,
        title: true,
      },
    });

    const blogsToPublish: any[] = [];

    // Helper to attach status (simplified version)
    const attachBlogStatus = (blog: any) => {
      const tags = blog.tags as any;
      if (!tags || typeof tags !== 'object' || Array.isArray(tags)) {
        return { status: 'PUBLISHED' as const };
      }
      const status = tags.status || 'PUBLISHED';
      const scheduledAt = tags.scheduledAt || null;
      return { status, scheduledAt };
    };

    // Filter blogs that are SCHEDULED and their scheduledAt time has passed
    for (const blog of blogs) {
      const blogWithStatus = attachBlogStatus(blog);

      if (blogWithStatus.status === 'SCHEDULED' && blogWithStatus.scheduledAt) {
        const scheduledDate = new Date(blogWithStatus.scheduledAt);
        if (scheduledDate <= now) {
          blogsToPublish.push(blog);
        }
      }
    }

    if (blogsToPublish.length === 0) {
      return { processed: 0 };
    }

    // Update each blog: change status to PUBLISHED and remove scheduledAt from tags
    const updates = blogsToPublish.map((blog) => {
      const tags = blog.tags as any;
      let updatedTags: any = {};

      // Preserve existing tags structure
      if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
        updatedTags = { ...tags };
      } else if (Array.isArray(tags)) {
        updatedTags = { tags };
      }

      updatedTags.status = 'PUBLISHED';
      delete updatedTags.scheduledAt;

      return prisma.blog.update({
        where: { id: blog.id },
        data: {
          tags: updatedTags,
        },
      });
    });

    await Promise.all(updates);

    console.log(`✅ Published ${blogsToPublish.length} scheduled blog(s)`);

    return {
      processed: blogsToPublish.length,
      blogTitles: blogsToPublish.map((b) => b.title),
    };
  } catch (error: any) {
    console.error('Publish scheduled blogs error:', error);
    throw error;
  }
};

// Internal function: Sync advertisement status (no HTTP overhead)
const syncAdvertisementStatusInternal = async () => {
  try {
    const now = new Date();

    // Find advertisements that should be active but aren't
    const shouldBeActive = await prisma.advertisement.findMany({
      where: {
        isActive: false,
        AND: [
          {
            OR: [
              { startsAt: null },
              { startsAt: { lte: now } },
            ],
          },
          {
            OR: [
              { endsAt: null },
              { endsAt: { gte: now } },
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
      },
    });

    // Find advertisements that should be inactive but aren't
    const shouldBeInactive = await prisma.advertisement.findMany({
      where: {
        isActive: true,
        OR: [
          {
            AND: [
              { startsAt: { not: null } },
              { startsAt: { gt: now } },
            ],
          },
          {
            AND: [
              { endsAt: { not: null } },
              { endsAt: { lt: now } },
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
      },
    });

    const updates: Promise<any>[] = [];

    // Activate advertisements that should be active
    if (shouldBeActive.length > 0) {
      updates.push(
        prisma.advertisement.updateMany({
          where: {
            id: { in: shouldBeActive.map((ad) => ad.id) },
          },
          data: {
            isActive: true,
          },
        })
      );
      console.log(`✅ Activating ${shouldBeActive.length} advertisement(s)`);
    }

    // Deactivate advertisements that should be inactive
    if (shouldBeInactive.length > 0) {
      updates.push(
        prisma.advertisement.updateMany({
          where: {
            id: { in: shouldBeInactive.map((ad) => ad.id) },
          },
          data: {
            isActive: false,
          },
        })
      );
      console.log(`✅ Deactivating ${shouldBeInactive.length} advertisement(s)`);
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    return {
      activated: shouldBeActive.length,
      deactivated: shouldBeInactive.length,
    };
  } catch (error: any) {
    console.error('Sync advertisement status error:', error);
    throw error;
  }
};

/**
 * Initialize all cron jobs
 * CRITICAL: Jobs call functions DIRECTLY instead of HTTP to save connections
 */
export const initializeCronJobs = () => {
  // All jobs run at 9 AM daily, but STAGGERED by 5 minutes to avoid concurrent load
  // This prevents multiple jobs hitting the database simultaneously

  // 9:00 AM - Sync expired subscriptions
  const syncExpiredJob = cron.schedule('0 9 * * *', async () => {
    console.log('🕐 Running scheduled task: Sync expired subscriptions');
    try {
      const result = await syncExpiredSubscriptionsInternal();
      console.log('✅ Expired subscriptions synced:', result);
    } catch (error: any) {
      console.error('❌ Error syncing expired subscriptions:', error.message);
    }
  }, {
    scheduled: false,
    timezone: 'Asia/Riyadh',
  });

  cronJobs.push({
    task: syncExpiredJob,
    running: false,
    name: 'Sync Expired Subscriptions',
  });

  // 9:05 AM - Check expiring subscriptions (staggered to avoid concurrent load)
  const subscriptionCheckJob = cron.schedule('5 9 * * *', async () => {
    console.log('🕐 Running scheduled task: Check expiring subscriptions');
    try {
      const result = await checkExpiringSubscriptionsInternal();
      console.log('✅ Subscription expiry check completed:', result);
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

  // 9:10 AM - Publish scheduled blogs (staggered)
  const publishScheduledBlogsJob = cron.schedule('10 9 * * *', async () => {
    console.log('🕐 Running scheduled task: Publish scheduled blogs');
    try {
      const result = await publishScheduledBlogsInternal();
      console.log('✅ Scheduled blogs published:', result);
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

  // 9:15 AM - Sync advertisement status (staggered)
  const syncAdvertisementStatusJob = cron.schedule('15 9 * * *', async () => {
    console.log('🕐 Running scheduled task: Sync advertisement status');
    try {
      const result = await syncAdvertisementStatusInternal();
      console.log('✅ Advertisement status synced:', result);
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

  console.log(`📅 ${cronJobs.length} cron job(s) initialized (direct function calls - no HTTP overhead)`);
  console.log('   Jobs are STAGGERED by 5 minutes to avoid concurrent database load');
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
