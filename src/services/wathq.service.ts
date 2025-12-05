import axios from 'axios';

interface WathqConfig {
  consumerKey: string;
  consumerSecret: string;
  baseUrl: string;
}

interface CRBasicInfo {
  crNationalNumber: string;
  crNumber: string;
  versionNo: number;
  name: string;
  duration: number;
  isMain: boolean;
  issueDateGregorian: string;
  issueDateHijri: string;
  hasEcommerce: boolean;
  headquarterCityName: string;
  isLicenseBased: boolean;
  entityType: {
    id: number;
    name: string;
    formId: number;
    formName: string;
  };
  status: {
    id: number;
    name: string;
  };
  activities: Array<{
    id: string;
    name: string;
  }>;
}

interface CRFullInfo extends CRBasicInfo {
  crCapital: number;
  inLiquidationProcess: boolean;
  contactInfo?: {
    phoneNo?: string;
    mobileNo?: string;
    email?: string;
    websiteUrl?: string;
  };
  capital: {
    currencyId: number;
    currencyName: string;
  };
  parties: Array<{
    name: string;
    typeId: number;
    typeName: string;
    identity: {
      id: string;
      typeId: number;
      typeName: string;
    };
    partnership?: Array<{
      id: number;
      name: string;
    }>;
    nationality?: {
      id: number;
      name: string;
    };
  }>;
  management?: {
    structureId: number;
    structureName: string;
    managers: Array<{
      name: string;
      positions: Array<{
        id: number;
        name: string;
      }>;
    }>;
  };
}

interface WathqResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

class WathqService {
  private config: WathqConfig;
  private apiKey: string;

  constructor() {
    this.config = {
      consumerKey: process.env.WATHQ_CONSUMER_KEY || '',
      consumerSecret: process.env.WATHQ_CONSUMER_SECRET || '',
      baseUrl: process.env.WATHQ_BASE_URL || 'https://api.wathq.sa/commercial-registration',
    };

    // Generate API Key (Base64 encode of key:secret)
    this.apiKey = Buffer.from(
      `${this.config.consumerKey}:${this.config.consumerSecret}`
    ).toString('base64');

    if (!this.config.consumerKey || !this.config.consumerSecret) {
      console.warn('⚠️  Wathq API credentials not configured');
    }
  }

  /**
   * Verify if the Wathq service is configured
   */
  isConfigured(): boolean {
    return !!(this.config.consumerKey && this.config.consumerSecret);
  }

  /**
   * Get basic commercial registration information
   * @param crNumber - Commercial Registration Number (10 digits)
   * @param language - 'ar' or 'en'
   */
  async getBasicInfo(
    crNumber: string,
    language: 'ar' | 'en' = 'ar'
  ): Promise<WathqResponse<CRBasicInfo>> {
    try {
      if (!this.isConfigured()) {
        throw new Error('Wathq API is not configured');
      }

      // Validate CR number format
      if (!/^\d{10}$/.test(crNumber)) {
        throw new Error('CR number must be exactly 10 digits');
      }

      const response = await axios.get(`${this.config.baseUrl}/info/${crNumber}`, {
        params: { language },
        headers: {
          Authorization: `Basic ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      console.error('Wathq API Error (Basic Info):', error.response?.data || error.message);
      
      if (error.response) {
        const errorData = error.response.data;
        throw new Error(errorData.message || 'Failed to verify CR number');
      }
      
      throw new Error('Unable to connect to CR verification service');
    }
  }

  /**
   * Get full commercial registration information including owners
   * @param crNumber - Commercial Registration Number (10 digits)
   * @param language - 'ar' or 'en'
   */
  async getFullInfo(
    crNumber: string,
    language: 'ar' | 'en' = 'ar'
  ): Promise<WathqResponse<CRFullInfo>> {
    try {
      if (!this.isConfigured()) {
        throw new Error('Wathq API is not configured');
      }

      // Validate CR number format
      if (!/^\d{10}$/.test(crNumber)) {
        throw new Error('CR number must be exactly 10 digits');
      }

      const response = await axios.get(`${this.config.baseUrl}/fullinfo/${crNumber}`, {
        params: { language },
        headers: {
          Authorization: `Basic ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 seconds
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      console.error('Wathq API Error (Full Info):', error.response?.data || error.message);
      
      if (error.response) {
        const errorData = error.response.data;
        
        // Handle specific error codes
        if (errorData.code === '404.2.1') {
          throw new Error('Commercial Registration number not found');
        } else if (errorData.code === '401.1.1') {
          throw new Error('Invalid API credentials');
        } else if (errorData.code?.startsWith('400')) {
          throw new Error(errorData.message || 'Invalid CR number format');
        }
        
        throw new Error(errorData.message || 'Failed to verify CR number');
      }
      
      throw new Error('Unable to connect to CR verification service');
    }
  }

  /**
   * Verify CR status (active, suspended, etc.)
   * @param crNumber - Commercial Registration Number (10 digits)
   * @param language - 'ar' or 'en'
   */
  async getStatus(
    crNumber: string,
    language: 'ar' | 'en' = 'ar',
    includeDates: boolean = false
  ): Promise<WathqResponse<any>> {
    try {
      if (!this.isConfigured()) {
        throw new Error('Wathq API is not configured');
      }

      if (!/^\d{10}$/.test(crNumber)) {
        throw new Error('CR number must be exactly 10 digits');
      }

      const response = await axios.get(`${this.config.baseUrl}/status/${crNumber}`, {
        params: { language, includeDates },
        headers: {
          Authorization: `Basic ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      console.error('Wathq API Error (Status):', error.response?.data || error.message);
      
      if (error.response) {
        const errorData = error.response.data;
        throw new Error(errorData.message || 'Failed to get CR status');
      }
      
      throw new Error('Unable to connect to CR verification service');
    }
  }

  /**
   * Check if a person/entity owns a CR
   * @param id - Identifier number
   * @param idType - Type of identifier
   * @param nationality - Nationality NIC code (required for Passport, Foreign_CR_No)
   */
  async checkOwnership(
    id: string,
    idType: 'National_ID' | 'Resident_ID' | 'Passport' | 'GCC_ID' | 'CR_National_ID',
    nationality?: number
  ): Promise<WathqResponse<{ ownsCr: boolean }>> {
    try {
      if (!this.isConfigured()) {
        throw new Error('Wathq API is not configured');
      }

      const params: any = {};
      if (nationality) {
        params.nationality = nationality;
      }

      const response = await axios.get(
        `${this.config.baseUrl}/owns/${id}/${idType}`,
        {
          params,
          headers: {
            Authorization: `Basic ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      console.error('Wathq API Error (Ownership):', error.response?.data || error.message);
      
      if (error.response) {
        const errorData = error.response.data;
        throw new Error(errorData.message || 'Failed to check ownership');
      }
      
      throw new Error('Unable to connect to CR verification service');
    }
  }
}

export default new WathqService();
export { CRBasicInfo, CRFullInfo, WathqResponse };

