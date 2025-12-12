# PayTabs Payment Gateway Integration

This document describes the PayTabs payment gateway integration for the Mawjood platform.

## Overview

The payment system uses PayTabs to process subscription payments securely. When a user subscribes to a plan, they are redirected to PayTabs' secure payment page where they can complete their payment.

## Configuration

### Environment Variables

Add the following environment variables to your `.env` file:

#### Test Environment
```env
PAYTABS_SERVER_KEY="SNJ9L6R9LD-JL9K2N6LKL-2RNL6H2RWZ"
PAYTABS_PROFILE_ID="120336"
PAYTABS_API_URL="https://secure.paytabs.sa"
PAYTABS_CURRENCY="SAR"
PAYTABS_CALLBACK_URL="http://localhost:5000/api/payments/paytabs/callback"
PAYTABS_RETURN_URL="http://localhost:5000/api/payments/paytabs/return"
FRONTEND_URL="http://localhost:3000"
```

**⚠️ IMPORTANT:** The `PAYTABS_RETURN_URL` must point to the **BACKEND** endpoint, NOT the frontend page. The backend handles verification and then redirects to the appropriate frontend page.

#### Production Environment
```env
PAYTABS_SERVER_KEY="SBJ9L6R9JB-JL9K2N6LTW-DNTGM26JT9"
PAYTABS_PROFILE_ID="120336"
PAYTABS_API_URL="https://secure.paytabs.sa"
PAYTABS_CURRENCY="SAR"
PAYTABS_CALLBACK_URL="https://api.yourdomain.com/api/payments/paytabs/callback"
PAYTABS_RETURN_URL="https://api.yourdomain.com/api/payments/paytabs/return"
FRONTEND_URL="https://yourdomain.com"
```

### Frontend Configuration

The frontend automatically uses the test client key for the test environment. For production, update the client key in the frontend configuration.

**Test Client Key:** `CVK2D7-KNDD6B-PKMQGB-V76KDP`
**Production Client Key:** `CGK2D7-KNRB6B-PKMQGB-VN69NP`

## Payment Flow

### 1. User Initiates Payment

1. User selects a subscription plan
2. User selects which business to subscribe
3. Frontend calls `/api/payments` to create a payment

### 2. Payment Creation

```typescript
POST /api/payments
Body: {
  businessId: string,
  amount: number,
  currency: string,
  description: string,
  returnUrl: string (optional)
}

Response: {
  paymentId: string,
  redirectUrl: string,  // PayTabs payment page URL
  transactionRef: string
}
```

### 3. User Redirected to PayTabs

- User is redirected to PayTabs secure payment page
- User enters their payment details
- User completes or cancels the payment

### 4. PayTabs Callbacks

#### Callback (Server-to-Server)

PayTabs sends a server-to-server callback to:
```
POST /api/payments/paytabs/callback
```

This webhook:
- Verifies the payment with PayTabs API
- Updates payment status in database
- Activates subscription if payment is successful

#### Return (Browser Redirect)

After payment, user is redirected to:
```
GET /api/payments/paytabs/return?tranRef={ref}&cartId={paymentId}
```

This endpoint:
- Verifies payment status
- Redirects user to appropriate frontend page:
  - Success: `/dashboard/payments/success`
  - Failed: `/dashboard/payments/failed`
  - Pending: `/dashboard/payments/pending`

## API Endpoints

### Backend

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/payments` | POST | Required | Create new payment |
| `/api/payments/paytabs/callback` | POST | None | PayTabs webhook callback |
| `/api/payments/paytabs/return` | GET | None | PayTabs return URL |
| `/api/payments/my-payments` | GET | Required | Get user's payments |
| `/api/payments/:id` | GET | Required | Get payment by ID |
| `/api/payments/business/:businessId` | GET | Required | Get business payments |
| `/api/payments/admin/all` | GET | Admin | Get all payments (admin) |

### Frontend Pages

| Page | Description |
|------|-------------|
| `/dashboard/subscriptions` | Subscription plans and purchase |
| `/dashboard/payments/success` | Payment success page |
| `/dashboard/payments/failed` | Payment failed page |
| `/dashboard/payments/pending` | Payment pending page |

## Payment Statuses

| Status | Description |
|--------|-------------|
| `PENDING` | Payment initiated but not completed |
| `COMPLETED` | Payment successful |
| `FAILED` | Payment declined or cancelled |
| `REFUNDED` | Payment refunded |

## PayTabs Response Codes

| Code | Description |
|------|-------------|
| `A` | Approved |
| `D` | Declined |
| `E` | Error |
| `V` | Voided |
| `H` | On Hold |
| `P` | Pending |

## Testing

### Test Cards

Use these test cards in the PayTabs test environment:

#### Successful Payment
- Card Number: `4111 1111 1111 1111`
- Expiry: Any future date
- CVV: Any 3 digits

#### Declined Payment
- Card Number: `4000 0000 0000 0002`
- Expiry: Any future date
- CVV: Any 3 digits

### Test Flow

1. Go to `/dashboard/subscriptions`
2. Select a subscription plan
3. Select a business
4. Click "Confirm Subscription"
5. You'll be redirected to PayTabs test payment page
6. Use test card details to complete payment
7. You'll be redirected back to success/failed page

## Security

### Webhook Verification

The callback handler verifies payments by:
1. Receiving callback data from PayTabs
2. Making a verification API call to PayTabs with the transaction reference
3. Only updating payment status after successful verification

### Data Protection

- Server keys are stored in environment variables
- Payment data is encrypted in transit (HTTPS)
- Sensitive data is not logged
- PayTabs handles all card data (PCI compliant)

## Troubleshooting

### Common Issues

#### 1. "Ad type is required" error
- **Cause:** Missing or invalid ad type parameter
- **Solution:** This is unrelated to payments. Check advertisement integration.

#### 2. Payment callback not received
- **Cause:** Callback URL not accessible
- **Solution:** 
  - Check firewall settings
  - Ensure backend is publicly accessible
  - Use ngrok for local testing: `ngrok http 5000`
  - Update `PAYTABS_CALLBACK_URL` with ngrok URL

#### 3. Payment stuck in PENDING
- **Cause:** Callback failed or user closed browser
- **Solution:** 
  - Check backend logs for callback errors
  - User can refresh payment status on pending page
  - Admin can manually verify payment via PayTabs dashboard

#### 4. Wrong environment keys
- **Cause:** Using production keys in test environment or vice versa
- **Solution:** 
  - Test keys start with `SN` and `CV`
  - Production keys start with `SB` and `CG`

#### 5. "Request must be type application/octet-stream" error
- **Cause:** Using a Mobile authentication key for a Web integration
- **Solution:** 
  - This error occurs when `PAYTABS_SERVER_KEY` contains a Mobile key instead of a Server/Web key
  - Verify your key type in the PayTabs merchant dashboard
  - Generate a new Server/Web authentication key if needed
  - Ensure your localhost `.env` file uses the correct Server/Web key (not Mobile key)
  - Test keys for Web integration should start with `SN` (test) or `SB` (production)
  - If it works in production but not localhost, check that your localhost environment uses the same key type as production

## Monitoring

### Important Logs

The system logs important payment events:

```typescript
// Payment creation
console.log('Payment created:', paymentId);

// PayTabs callback
console.log('PayTabs Callback received:', callbackData);

// Payment verification
console.log('Payment verified:', verificationResult);

// Payment status update
console.log('Payment status updated:', paymentStatus);
```

### Metrics to Monitor

- Payment success rate
- Average payment processing time
- Failed payment reasons
- Pending payment count

## Support

For PayTabs API support:
- Documentation: https://site.paytabs.com/en/paytabs-api/
- Support: support@paytabs.com
- Dashboard: https://merchant.paytabs.sa/

For Mawjood platform support:
- Check application logs
- Review payment records in database
- Contact development team

## Future Improvements

- [ ] Add payment retry mechanism
- [ ] Implement refund functionality
- [ ] Add payment analytics dashboard
- [ ] Support multiple payment methods
- [ ] Add payment reminder emails
- [ ] Implement recurring payments

