import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

export class ErpClient {
  private http: AxiosInstance;

  constructor(apiUrl: string, apiKey: string) {
    this.http = axios.create({
      baseURL: apiUrl,
      timeout: 15000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
    });

    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('ERP API error', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
        });
        this.handleApiError(error);
      }
    );
  }

  async getInventory(params: {
    brand?: string;
    productType?: string;
    sku?: string;
    location?: string;
  }): Promise<any> {
    const queryParams: Record<string, string> = {};
    if (params.brand) queryParams.brand = params.brand;
    if (params.productType) queryParams.productType = params.productType;
    if (params.sku) queryParams.sku = params.sku;
    if (params.location) queryParams.location = params.location;

    const res = await this.http.get('/inventory', { params: queryParams });
    return res.data;
  }

  async getPOStatus(params: { poNumber: string }): Promise<any> {
    const res = await this.http.get(
      `/purchase-orders/${encodeURIComponent(params.poNumber)}`
    );
    return res.data;
  }

  async createPO(params: {
    vendor: string;
    items: Array<{ sku: string; quantity: number; unitPrice: number }>;
    expectedDate?: string;
  }): Promise<any> {
    const res = await this.http.post('/purchase-orders', {
      vendor: params.vendor,
      items: params.items,
      expectedDate: params.expectedDate,
    });
    return res.data;
  }

  private handleApiError(error: any): never {
    const status = error.response?.status;

    if (status === 401 || status === 403) {
      throw new Error(
        `ERP authentication failed (${status}). Check ERP_API_URL and ERP_API_KEY.`
      );
    }
    if (status === 429) {
      throw new Error(
        'ERP rate limit exceeded. Please try again in a few minutes.'
      );
    }
    if (status === 404) {
      throw new Error(
        `ERP resource not found: ${error.config?.url}`
      );
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new Error(
        'ERP API timed out. The service may be temporarily unavailable.'
      );
    }

    throw new Error(
      `ERP error: ${error.response?.data?.message || error.message}`
    );
  }
}
