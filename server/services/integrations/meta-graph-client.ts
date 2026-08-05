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
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
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

    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new MetaGraphError('Failed to parse Meta OAuth response.', 'meta_invalid_response', 502);
    }

    const errObj = data.error as Record<string, unknown> | undefined;
    if (!response.ok || errObj) {
      const errSubcode = errObj?.error_subcode as number | undefined;
      const errMessage = (errObj?.message as string) || 'Meta OAuth code exchange failed.';
      const codeType = errSubcode === 33 ? 'code_already_used' : 'oauth_exchange_failed';
      throw new MetaGraphError(errMessage, codeType, response.status || 400);
    }

    const accessToken = data.access_token;
    if (!accessToken || typeof accessToken !== 'string') {
      throw new MetaGraphError('Meta OAuth response did not contain a valid access_token.', 'invalid_token_response', 502);
    }

    return {
      access_token: accessToken,
      token_type: (data.token_type as string) || 'bearer',
      expires_in: typeof data.expires_in === 'number' ? data.expires_in : undefined,
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

    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new MetaGraphError('Failed to parse WABA details response.', 'meta_invalid_response', 502);
    }

    const errObj = data.error as Record<string, unknown> | undefined;
    if (!response.ok || errObj) {
      throw new MetaGraphError((errObj?.message as string) || 'Failed to fetch WABA details from Meta.', 'waba_fetch_failed', response.status || 400);
    }

    return {
      id: String(data.id || wabaId),
      name: data.name as string | undefined,
      currency: data.currency as string | undefined,
      timezone_id: data.timezone_id as string | undefined,
      message_template_namespace: data.message_template_namespace as string | undefined,
      account_review_status: data.account_review_status as string | undefined,
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

    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new MetaGraphError('Failed to parse WABA phone numbers response.', 'meta_invalid_response', 502);
    }

    const errObj = data.error as Record<string, unknown> | undefined;
    if (!response.ok || errObj) {
      throw new MetaGraphError((errObj?.message as string) || 'Failed to fetch phone numbers from Meta.', 'phone_numbers_fetch_failed', response.status || 400);
    }

    if (!Array.isArray(data.data)) {
      return [];
    }

    return data.data.map((rawItem: unknown) => {
      const p = rawItem as Record<string, unknown>;
      return {
        id: String(p.id || ''),
        display_phone_number: String(p.display_phone_number || ''),
        verified_name: String(p.verified_name || ''),
        code_verification_status: p.code_verification_status as string | undefined,
        quality_rating: p.quality_rating as string | undefined,
        messaging_limit_tier: p.messaging_limit_tier as string | undefined,
      };
    });
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

    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
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

    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      return false;
    }

    return Boolean(response.ok && data.success);
  }
}
