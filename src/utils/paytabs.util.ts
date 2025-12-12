import axios from 'axios';
import { paytabsConfig } from '../config/paytabs';

interface PayTabsCustomer {
  name: string;
  email: string;
  phone?: string;
  street1?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
}

interface PayTabsPaymentRequest {
  profile_id: string;
  tran_type: 'sale' | 'auth' | 'register';
  tran_class: 'ecom' | 'recurring';
  cart_id: string;
  cart_description: string;
  cart_currency: string;
  cart_amount: number;
  callback: string;
  return: string;
  customer_details: PayTabsCustomer;
  hide_shipping?: boolean;
}

interface PayTabsPaymentResponse {
  tran_ref: string;
  tran_type: string;
  cart_id: string;
  cart_description: string;
  cart_currency: string;
  cart_amount: string;
  redirect_url: string;
  serviceId?: string;
  profileId?: string;
  merchantId?: string;
  trace?: string;
}

interface PayTabsCallbackResponse {
  tran_ref: string;
  cart_id: string;
  cart_description: string;
  cart_currency: string;
  cart_amount: string;
  tran_currency: string;
  tran_total: string;
  tran_type: string;
  tran_class: string;
  customer_details: {
    name: string;
    email: string;
    phone: string;
    street1: string;
    city: string;
    state: string;
    country: string;
    ip: string;
  };
  payment_result: {
    response_status: string; // "A" for approved, "D" for declined, "H" for on hold
    response_code: string;
    response_message: string;
    transaction_time: string;
  };
  payment_info?: {
    payment_method: string;
    card_type?: string;
    card_scheme?: string;
  };
}

export class PayTabsService {
  private serverKey: string;
  private profileId: string;
  private apiUrl: string;

  constructor() {
    this.serverKey = paytabsConfig.serverKey;
    this.profileId = paytabsConfig.profileId;
    this.apiUrl = paytabsConfig.apiUrl;
  }

  /**
   * Create a payment page with PayTabs
   */
  async createPaymentPage(
    amount: number,
    currency: string,
    cartId: string,
    description: string,
    customer: PayTabsCustomer,
    callbackUrl?: string,
    returnUrl?: string
  ): Promise<PayTabsPaymentResponse> {
    try {
      // Validate server key format (Web/Server keys should not be Mobile keys)
      if (!this.serverKey || this.serverKey.trim() === '') {
        throw new Error('PayTabs server key is not configured. Please set PAYTABS_SERVER_KEY in your environment variables.');
      }

      // Check if using a Mobile key (common cause of application/octet-stream error)
      // Mobile keys typically have different prefixes, but this is a heuristic check
      if (this.serverKey.includes('mobile') || this.serverKey.toLowerCase().includes('mobile')) {
        console.warn('Warning: PayTabs server key may be a Mobile key. Web integrations require a Server/Web key.');
      }

      const payload: PayTabsPaymentRequest = {
        profile_id: this.profileId,
        tran_type: 'sale',
        tran_class: 'ecom',
        cart_id: cartId,
        cart_description: description,
        cart_currency: currency,
        cart_amount: amount,
        callback: callbackUrl || paytabsConfig.callbackUrl,
        return: returnUrl || paytabsConfig.returnUrl,
        customer_details: customer,
        hide_shipping: true,
      };

      const response = await axios.post<PayTabsPaymentResponse>(
        `${this.apiUrl}/payment/request`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.serverKey,
          },
        }
      );

      if (!response.data || !response.data.redirect_url) {
        throw new Error('Invalid response from PayTabs API');
      }
      return response.data;
    } catch (error: any) {
      console.error('PayTabs payment creation error:', error);
      console.error('PayTabs error response:', error.response?.data);
      console.error('PayTabs error status:', error.response?.status);
      
      // Extract error message
      let errorMessage = 'Failed to create PayTabs payment page';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      // Provide helpful error message for the application/octet-stream error
      if (errorMessage.includes('application/octet-stream')) {
        errorMessage = 'PayTabs authentication error: You are using a Mobile authentication key for a Web integration. Please ensure you are using a Server/Web authentication key in your PAYTABS_SERVER_KEY environment variable. Check your PayTabs merchant dashboard to generate the correct key type.';
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Verify payment callback from PayTabs
   */
  async verifyPayment(tranRef: string): Promise<PayTabsCallbackResponse> {
    try {
      const response = await axios.post<PayTabsCallbackResponse>(
        `${this.apiUrl}/payment/query`,
        {
          profile_id: this.profileId,
          tran_ref: tranRef,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.serverKey,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('PayTabs verification error:', error.response?.data || error.message);
      throw new Error(
        error.response?.data?.message || 'Failed to verify PayTabs payment'
      );
    }
  }

  /**
   * Parse payment status from callback response
   */
  parsePaymentStatus(responseStatus: string): 'COMPLETED' | 'FAILED' | 'PENDING' {
    const code = (responseStatus || '').toUpperCase();
    switch (code) {
      case 'A': // Approved
      case 'S': // Sometimes returned as Success
        return 'COMPLETED';
      case 'D': // Declined
      case 'E': // Error
      case 'V': // Voided
      case 'C': // Cancelled
        return 'FAILED';
      case 'H': // On Hold
      case 'P': // Pending
      default:
        return 'PENDING';
    }
  }

  /**
   * Validate callback signature (if applicable)
   */
  validateCallbackSignature(signature: string, data: any): boolean {
    // PayTabs doesn't use signature validation in the standard flow
    // The verification is done by querying their API with tran_ref
    return true;
  }
}

export const paytabsService = new PayTabsService();

