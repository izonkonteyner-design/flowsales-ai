import { createSupabaseAdminClient } from '@/lib/supabase/server-admin';

export interface WhatsAppConnectionPayload {
  organizationId: string;
  wabaId: string;
  phoneNumberId: string;
  businessId?: string;
  verifiedName: string;
  displayPhoneNumber: string;
  qualityRating?: string;
  messagingLimitTier?: string;
  codeVerificationStatus?: string;
  accountReviewStatus?: string;
  webhookSubscribedAt?: string;
  tokenExpiresAt?: string;
  createdBy: string;
  status: 'connected' | 'connecting' | 'error' | 'revoked';
  errorCode?: string;
  errorMessage?: string;
}

export interface WhatsAppTokenPayload {
  organizationId: string;
  connectionId: string;
  accessTokenCipher: string;
  tokenType?: string;
  expiresAt?: string;
  scopes?: string[];
}

export class WhatsAppConnectionsRepository {
  /**
   * Checks if WABA or phone_number_id is already connected in any workspace.
   */
  async findGlobalExistingConnection(wabaId: string, phoneNumberId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('channel_connections')
      .select('id, organization_id, status, waba_id, phone_number_id')
      .eq('provider', 'whatsapp')
      .or(`waba_id.eq.${wabaId},phone_number_id.eq.${phoneNumberId}`)
      .in('status', ['connected', 'connecting'])
      .maybeSingle();

    if (error) {
      console.error('[WhatsAppRepo] Error checking global connection:', error.message);
    }
    return data;
  }

  /**
   * Gets the active or primary WhatsApp connection for a workspace.
   */
  async getWhatsAppConnectionForOrg(organizationId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('channel_connections')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('provider', 'whatsapp')
      .maybeSingle();

    if (error) {
      console.error('[WhatsAppRepo] Error getting org connection:', error.message);
      return null;
    }
    return data;
  }

  /**
   * Upserts the channel_connections record for WhatsApp.
   */
  async upsertWhatsAppConnection(payload: WhatsAppConnectionPayload) {
    const supabase = createSupabaseAdminClient();
    const displayName = payload.verifiedName || payload.displayPhoneNumber || 'WhatsApp Business';

    const record = {
      organization_id: payload.organizationId,
      provider: 'whatsapp',
      status: payload.status,
      display_name: displayName,
      external_account_id: payload.phoneNumberId,
      waba_id: payload.wabaId,
      phone_number_id: payload.phoneNumberId,
      business_id: payload.businessId || null,
      verified_name: payload.verifiedName,
      display_phone_number: payload.displayPhoneNumber,
      quality_rating: payload.qualityRating || null,
      messaging_limit_tier: payload.messagingLimitTier || null,
      code_verification_status: payload.codeVerificationStatus || null,
      account_review_status: payload.accountReviewStatus || null,
      webhook_subscribed_at: payload.webhookSubscribedAt || null,
      connection_verified_at: payload.status === 'connected' ? new Date().toISOString() : null,
      token_expires_at: payload.tokenExpiresAt || null,
      connection_error_code: payload.errorCode || null,
      connection_error_message: payload.errorMessage || null,
      created_by: payload.createdBy,
      updated_by: payload.createdBy,
      last_connected_at: payload.status === 'connected' ? new Date().toISOString() : null,
      disconnected_at: payload.status === 'revoked' ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase
      .from('channel_connections')
      .upsert(record, { onConflict: 'organization_id,provider' })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save WhatsApp connection: ${error.message}`);
    }
    return data;
  }

  /**
   * Upserts the channel_accounts record for WhatsApp.
   */
  async upsertWhatsAppAccount(organizationId: string, connectionId: string, payload: {
    phoneNumberId: string;
    verifiedName: string;
    displayPhoneNumber: string;
    wabaId: string;
  }) {
    const supabase = createSupabaseAdminClient();
    const record = {
      organization_id: organizationId,
      connection_id: connectionId,
      provider: 'whatsapp',
      external_id: payload.phoneNumberId,
      display_name: payload.verifiedName || payload.displayPhoneNumber,
      metadata: {
        waba_id: payload.wabaId,
        display_phone_number: payload.displayPhoneNumber,
        verified_name: payload.verifiedName,
      },
    };

    const { data, error } = await supabase
      .from('channel_accounts')
      .upsert(record, { onConflict: 'organization_id,provider,external_id' })
      .select()
      .single();

    if (error) {
      console.error('[WhatsAppRepo] Error saving channel_account:', error.message);
    }
    return data;
  }

  /**
   * Stores encrypted access token in integration_tokens.
   */
  async storeWhatsAppTokens(payload: WhatsAppTokenPayload) {
    const supabase = createSupabaseAdminClient();
    const record = {
      organization_id: payload.organizationId,
      connection_id: payload.connectionId,
      provider: 'whatsapp',
      access_token_cipher: payload.accessTokenCipher,
      token_type: payload.tokenType || 'bearer',
      expires_at: payload.expiresAt || null,
      scopes: payload.scopes || ['whatsapp_business_management', 'whatsapp_business_messaging'],
    };

    const { data, error } = await supabase
      .from('integration_tokens')
      .upsert(record, { onConflict: 'connection_id' })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to store integration tokens: ${error.message}`);
    }
    return data;
  }

  /**
   * Gets encrypted token for connection.
   */
  async getWhatsAppToken(connectionId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('integration_tokens')
      .select('*')
      .eq('connection_id', connectionId)
      .maybeSingle();

    if (error) {
      console.error('[WhatsAppRepo] Error getting integration_token:', error.message);
      return null;
    }
    return data;
  }

  /**
   * Soft disconnects WhatsApp connection.
   */
  async disconnectWhatsAppConnection(organizationId: string, connectionId: string, userId: string) {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('channel_connections')
      .update({
        status: 'revoked',
        disconnected_at: now,
        disconnected_by: userId,
        updated_by: userId,
      })
      .eq('id', connectionId)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to disconnect WhatsApp connection: ${error.message}`);
    }

    // Clear access token cipher in integration_tokens for security
    await supabase
      .from('integration_tokens')
      .update({
        access_token_cipher: null,
        refresh_token_cipher: null,
      })
      .eq('connection_id', connectionId);

    return data;
  }

  /**
   * Updates health check status on connection.
   */
  async updateHealthCheckStatus(connectionId: string, status: 'connected' | 'error' | 'expired' | 'revoked', errorCode?: string, errorMessage?: string) {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const updates: any = {
      status,
      last_health_check_at: now,
      connection_error_code: errorCode || null,
      connection_error_message: errorMessage || null,
    };
    if (status === 'connected') {
      updates.connection_verified_at = now;
    }

    const { data, error } = await supabase
      .from('channel_connections')
      .update(updates)
      .eq('id', connectionId)
      .select()
      .single();

    if (error) {
      console.error('[WhatsAppRepo] Error updating health check status:', error.message);
    }
    return data;
  }
}
