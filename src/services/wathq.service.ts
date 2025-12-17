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

  constructor() {
    this.config = {
      consumerKey: process.env.WATHQ_CONSUMER_KEY || '',
      consumerSecret: process.env.WATHQ_CONSUMER_SECRET || '',
      baseUrl: process.env.WATHQ_BASE_URL || 'https://api.wathq.sa',
    };

    if (!this.config.consumerKey) {
      console.warn('⚠️  Wathq API key not configured');
    }
  }

  /**
   * Verify if the Wathq service is configured
   */
  isConfigured(): boolean {
    return !!this.config.consumerKey;
  }

  /**
   * Get basic commercial registration information
   * @param crNumber - Commercial Registration National Number (e.g., 700 for testing)
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

      // Validate CR National Number format (as per Wathq guidance - can be any numeric value like 700 for testing)
      if (!/^\d+$/.test(crNumber) || crNumber.trim() === '') {
        throw new Error('CR National Number must be a valid numeric value');
      }

      const response = await axios.get(
        `${this.config.baseUrl}/v5/commercialregistration/info/${crNumber}`,
        {
          headers: {
            accept: 'application/json',
            apiKey: this.config.consumerKey,
          },
          timeout: 30000,
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      console.error('Wathq API Error (Basic Info):', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });

      if (error.response) {
        const errorData = error.response.data;

        // Handle specific error codes
        if (error.response.status === 401 || errorData.code === '401.1.1') {
          throw new Error('Invalid API credentials. Please check your API key.');
        } else if (errorData.code === '404.2.1') {
          throw new Error('Commercial Registration number not found');
        } else if (errorData.code?.startsWith('400')) {
          throw new Error(errorData.message || 'Invalid CR number format');
        }

        throw new Error(errorData.message || `API Error: ${error.response.status}`);
      }

      throw new Error('Unable to connect to CR verification service');
    }
  }

  /**
   * Get full commercial registration information including owners
   * @param crNumber - Commercial Registration National Number (e.g., 700 for testing)
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

      // Validate CR National Number format (as per Wathq guidance - can be any numeric value like 700 for testing)
      if (!/^\d+$/.test(crNumber) || crNumber.trim() === '') {
        throw new Error('CR National Number must be a valid numeric value');
      }

      const response = await axios.get(
        `${this.config.baseUrl}/v5/commercialregistration/fullinfo/${crNumber}`,
        {
          headers: {
            accept: 'application/json',
            apiKey: this.config.consumerKey,
          },
          timeout: 30000,
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      console.error('Wathq API Error (Full Info):', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });

      if (error.response) {
        const errorData = error.response.data;

        if (error.response.status === 401 || errorData.code === '401.1.1') {
          throw new Error('Invalid API credentials. Please check your API key.');
        } else if (errorData.code === '404.2.1') {
          throw new Error('Commercial Registration number not found');
        } else if (errorData.code?.startsWith('400')) {
          throw new Error(errorData.message || 'Invalid CR number format');
        }

        throw new Error(errorData.message || `API Error: ${error.response.status}`);
      }

      throw new Error('Unable to connect to CR verification service');
    }
  }

  /**
   * Verify CR status (active, suspended, etc.)
   * @param crNumber - Commercial Registration National Number (e.g., 700 for testing)
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

      // Validate CR National Number format (as per Wathq guidance - can be any numeric value like 700 for testing)
      if (!/^\d+$/.test(crNumber) || crNumber.trim() === '') {
        throw new Error('CR National Number must be a valid numeric value');
      }

      const response = await axios.get(
        `${this.config.baseUrl}/v5/commercialregistration/status/${crNumber}`,
        {
          headers: {
            accept: 'application/json',
            apiKey: this.config.consumerKey,
          },
          timeout: 30000,
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      console.error('Wathq API Error (Status):', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });

      if (error.response) {
        const errorData = error.response.data;

        if (error.response.status === 401 || errorData.code === '401.1.1') {
          throw new Error('Invalid API credentials. Please check your API key.');
        } else if (errorData.code === '404.2.1') {
          throw new Error('Commercial Registration number not found');
        } else if (errorData.code?.startsWith('400')) {
          throw new Error(errorData.message || 'Invalid CR number format');
        }

        throw new Error(errorData.message || `API Error: ${error.response.status}`);
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

      // For ownership check, we may need to check the actual v5 endpoint structure
      // Based on the working example, we'll use the same pattern
      const response = await axios.get(
        `${this.config.baseUrl}/v5/commercialregistration/owns/${id}/${idType}`,
        {
          params: nationality ? { nationality } : undefined,
          headers: {
            accept: 'application/json',
            apiKey: this.config.consumerKey,
          },
          timeout: 30000,
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      console.error('Wathq API Error (Ownership):', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });

      if (error.response) {
        const errorData = error.response.data;

        if (error.response.status === 401 || errorData.code === '401.1.1') {
          throw new Error('Invalid API credentials. Please check your API key.');
        } else if (errorData.code?.startsWith('400')) {
          throw new Error(errorData.message || 'Invalid request parameters');
        }

        throw new Error(errorData.message || `API Error: ${error.response.status}`);
      }

      throw new Error('Unable to connect to CR verification service');
    }
  }
}

export default new WathqService();
export { CRBasicInfo, CRFullInfo, WathqResponse };