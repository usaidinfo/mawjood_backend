# Subscription Expiry Email Testing Guide

## How to Test Subscription Expiry Emails

### Option 1: Manual Testing (Recommended for Development)

1. **Create a test subscription** that expires soon:
   - Create a subscription with `endsAt` set to 1-7 days from now
   - Make sure the subscription status is `ACTIVE`
   - Ensure the business owner has a valid email address

2. **Call the endpoint manually**:
   ```bash
   # Using curl
   curl http://localhost:5000/api/subscriptions/check/expiring

   # Or open in browser
   http://localhost:5000/api/subscriptions/check/expiring
   ```

3. **Check the response**:
   - You should see: `{ "success": true, "message": "Expiring subscriptions checked successfully", "data": { "processed": X, "totalExpiring": Y } }`
   - Check the server logs for email sending status
   - Check the user's email inbox

### Option 2: Using Postman/Thunder Client

1. **GET Request**:
   - URL: `http://localhost:5000/api/subscriptions/check/expiring`
   - Method: `GET`
   - No authentication required (public endpoint for cron jobs)

2. **Expected Response**:
   ```json
   {
     "success": true,
     "message": "Expiring subscriptions checked successfully",
     "data": {
       "processed": 2,
       "totalExpiring": 2
     }
   }
   ```

### Option 3: Automated Cron Job (Production)

1. **Enable cron jobs** in `.env`:
   ```env
   ENABLE_CRON_JOBS=true
   BACKEND_URL=http://localhost:5000
   ```

2. **Cron Schedule**:
   - Currently set to run **daily at 9 AM (Saudi Arabia time)**
   - You can modify the schedule in `src/utils/cron.ts`

3. **Restart the server**:
   ```bash
   npm run dev
   # or
   npm start
   ```

4. **Check logs**:
   - You'll see: `🕐 Running scheduled task: Check expiring subscriptions`
   - Followed by success/error messages

## Creating Test Data

### Using Prisma Studio:
```bash
npm run prisma:studio
```

1. Navigate to `BusinessSubscription` table
2. Create a new subscription with:
   - `status`: `ACTIVE`
   - `endsAt`: Set to 1-7 days from now (e.g., `2024-01-15T09:00:00Z`)
   - `businessId`: Link to an existing business
   - `planId`: Link to an existing subscription plan

### Using SQL:
```sql
-- Find a business and plan first
SELECT id FROM Business LIMIT 1;
SELECT id FROM SubscriptionPlan LIMIT 1;

-- Create test subscription expiring in 3 days
INSERT INTO BusinessSubscription (
  id, 
  businessId, 
  planId, 
  status, 
  startsAt, 
  endsAt, 
  createdAt, 
  updatedAt
) VALUES (
  UUID(),
  'your-business-id',
  'your-plan-id',
  'ACTIVE',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 3 DAY), -- Expires in 3 days
  NOW(),
  NOW()
);
```

## Email Notification Rules

The system sends emails when subscriptions expire in:
- **1 day**: "Subscription Expiring Tomorrow! ⚠️"
- **2-3 days**: "Subscription Expiring Soon! ⚠️"
- **4-7 days**: "Subscription Expiring Soon"

**Note**: The system prevents duplicate notifications by checking if a notification was sent in the last 24 hours.

## Troubleshooting

### No emails sent?
1. Check if subscriptions exist with `endsAt` between now and 7 days from now
2. Check if subscription status is `ACTIVE`
3. Check if business owner has a valid email
4. Check server logs for email service errors
5. Verify Brevo API key and configuration in `.env`

### Emails sent but not received?
1. Check spam folder
2. Verify sender email is verified in Brevo
3. Check Brevo dashboard for email delivery status
4. Verify email address in database is correct

### Cron job not running?
1. Check `ENABLE_CRON_JOBS=true` in `.env`
2. Restart the server
3. Check server logs for cron initialization messages
4. Verify timezone is correct (default: Asia/Riyadh)

## Testing Different Scenarios

### Test 1 day expiry:
```sql
UPDATE BusinessSubscription 
SET endsAt = DATE_ADD(NOW(), INTERVAL 1 DAY)
WHERE id = 'your-subscription-id';
```

### Test 3 days expiry:
```sql
UPDATE BusinessSubscription 
SET endsAt = DATE_ADD(NOW(), INTERVAL 3 DAY)
WHERE id = 'your-subscription-id';
```

### Test 7 days expiry:
```sql
UPDATE BusinessSubscription 
SET endsAt = DATE_ADD(NOW(), INTERVAL 7 DAY)
WHERE id = 'your-subscription-id';
```

Then call the endpoint to trigger the check.

