import { getWhatsAppConfig } from './whatsapp-config';

export interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export interface MetaWabaInfo {
  id: string;
  name?: string;
  currency?: string;
  timezone_id?: string;
  message_template_namespace?: string;
  account_review_status?: string;
}

export interface MetaPhoneNumberInfo {
  id: string;
  display_phone_number: string;
  verified_name: string;
  code_verification_status?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
}

export class MetaGraphError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'meta_graph_api_error',
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'MetaGraphError';
  }
}

export class MetaGraphClient {
  private readonly baseUrl: string;
  private readonly appId: string;
  private readonly appSecret: string;

  constructor() {
    const config = getWhatsAppConfig();
    this.baseUrl = `https://graph.facebook.com/${config.apiVersion}`;
    this.appId = config.appId;
    this.appSecret = config.appSecret;
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'FlowSales-AI/1.0',
          'Accept': 'application/json',
          ...(options.headers || {}),
        },
      });
      return response;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new MetaGraphError('Meta Graph API request timed out after 10 seconds.', 'meta_api_timeout', 504);
      }
      throw new MetaGraphError('Failed to connect to Meta Graph API.', 'meta_network_error', 502);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Exchanges an authorization code obtained via Meta Embedded Signup for a system user access token.
   */
  async exchangeCodeForToken(code: string): Promise<MetaTokenResponse> {
    if (!code || typeof code !== 'string') {
      throw new MetaGraphError('Invalid authorization code provided.', 'invalid_auth_code', 400);
    }

    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      code: code.trim(),
    });

    const url = `${this.baseUrl}/oauth/access_token?${params.toString()}`;
    const response = await this.fetchWithTimeout(url, { method: 'GET' });

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new MetaGraphError('Failed to parse Meta OAuth response.', 'meta_invalid_response', 502);
    }

    if (!response.ok || data.error) {
      const errSubcode = data?.error?.error_subcode;
      const errMessage = data?.error?.message || 'Meta OAuth code exchange failed.';
      const code = errSubcode === 33 ? 'code_already_used' : 'oauth_exchange_failed';
      throw new MetaGraphError(errMessage, code, response.status || 400);
    }

    if (!data.access_token || typeof data.access_token !== 'string') {
      throw new MetaGraphError('Meta OAuth response did not contain a valid access_token.', 'invalid_token_response', 502);
    }

    return {
      access_token: data.access_token,
      token_type: data.token_type || 'bearer',
      expires_in: data.expires_in,
    };
  }

  /**
   * Fetches WhatsApp Business Account (WABA) details from Meta Graph API.
   */
  async getWabaDetails(wabaId: string, accessToken: string): Promise<MetaWabaInfo> {
    const url = `${this.baseUrl}/${encodeURIComponent(wabaId)}?fields=id,name,currency,timezone_id,message_template_namespace,account_review_status`;
    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new MetaGraphError('Failed to parse WABA details response.', 'meta_invalid_response', 502);
    }

    if (!response.ok || data.error) {
      throw new MetaGraphError(data?.error?.message || 'Failed to fetch WABA details from Meta.', 'waba_fetch_failed', response.status || 400);
    }

    return {
      id: data.id,
      name: data.name,
      currency: data.currency,
      timezone_id: data.timezone_id,
      message_template_namespace: data.message_template_namespace,
      account_review_status: data.account_review_status,
    };
  }

  /**
   * Fetches phone numbers associated with a WABA from Meta Graph API.
   */
  async getWabaPhoneNumbers(wabaId: string, accessToken: string): Promise<MetaPhoneNumberInfo[]> {
    const url = `${this.baseUrl}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,messaging_limit_tier`;
    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new MetaGraphError('Failed to parse WABA phone numbers response.', 'meta_invalid_response', 502);
    }

    if (!response.ok || data.error) {
      throw new MetaGraphError(data?.error?.message || 'Failed to fetch phone numbers from Meta.', 'phone_numbers_fetch_failed', response.status || 400);
    }

    if (!Array.isArray(data.data)) {
      return [];
    }

    return data.data.map((p: any) => ({
      id: p.id,
      display_phone_number: p.display_phone_number || '',
      verified_name: p.verified_name || '',
      code_verification_status: p.code_verification_status,
      quality_rating: p.quality_rating,
      messaging_limit_tier: p.messaging_limit_tier,
    }));
  }

  /**
   * Subscribes the WABA to this app's webhooks.
   */
  async subscribeWabaToApp(wabaId: string, accessToken: string): Promise<boolean> {
    const url = `${this.baseUrl}/${encodeURIComponent(wabaId)}/subscribed_apps`;
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    let data: any;
    try {
      data = await response.json();
    } catch {
      return false;
    }

    return Boolean(response.ok && data.success);
  }

  /**
   * Unsubscribes the WABA from this app's webhooks.
   */
  async unsubscribeWabaFromApp(wabaId: string, accessToken: string): Promise<boolean> {
    const url = `${this.baseUrl}/${encodeURIComponent(wabaId)}/subscribed_apps`;
    const response = await this.fetchWithTimeout(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    let data: any;
    try {
      data = await response.json();
    } catch {
      return false;
    }

    return Boolean(response.ok && data.success);
  }
}
