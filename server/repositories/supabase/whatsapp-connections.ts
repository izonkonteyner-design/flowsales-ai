import { createSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { logger } from '@/lib/logger';

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
   * Fail-closed: Throws an error if the database query fails.
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
      logger.error('whatsapp.find_global_connection_failed', error);
      throw new Error('Failed to verify existing WhatsApp connections due to database error.');
    }
    return data;
  }

  /**
   * Finds an active WhatsApp connection for an incoming webhook event.
   * Returns null if no active connection exists for the WABA or phone number.
   * Fail-closed: Throws an error if database query fails.
   */
  async findActiveConnectionForWebhook(wabaId?: string, phoneNumberId?: string) {
    const safeWabaId = wabaId && /^\d{1,64}$/.test(wabaId) ? wabaId : undefined;
    const safePhoneNumberId = phoneNumberId && /^\d{1,64}$/.test(phoneNumberId) ? phoneNumberId : undefined;

    if (!safeWabaId && !safePhoneNumberId) {
      return null;
    }

    const supabase = createSupabaseAdminClient();
    const identifierFilters = [
      safeWabaId ? `waba_id.eq.${safeWabaId}` : null,
      safePhoneNumberId ? `phone_number_id.eq.${safePhoneNumberId}` : null,
    ].filter((value): value is string => Boolean(value));

    const { data, error } = await supabase
      .from('channel_connections')
      .select('id, organization_id, status, waba_id, phone_number_id')
      .eq('provider', 'whatsapp')
      .eq('status', 'connected')
      .or(identifierFilters.join(','));

    if (error) {
      logger.error('whatsapp.find_active_webhook_connection_failed', error);
      throw new Error('Failed to query active WhatsApp connection for webhook.');
    }

    if (!data || data.length === 0) return null;
    if (data.length !== 1) {
      logger.error('whatsapp.ambiguous_active_webhook_connection');
      throw new Error('Ambiguous active WhatsApp connection for webhook.');
    }

    return data[0];
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
      logger.error('whatsapp.get_org_connection_failed', error);
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
      .upsert(record, {
        onConflict: 'organization_id,provider',
      })
      .select('*')
      .single();

    if (error) {
      logger.error('whatsapp.upsert_connection_failed', error);
      throw new Error('Failed to save WhatsApp connection.');
    }

    return data;
  }

  /**
   * Upserts channel_accounts record for WhatsApp using exact 0027 migration schema columns.
   */
  async upsertWhatsAppAccount(organizationId: string, connectionId: string, accountInfo: {
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
      external_id: accountInfo.phoneNumberId,
      display_name: accountInfo.verifiedName || accountInfo.displayPhoneNumber,
      metadata: {
        waba_id: accountInfo.wabaId,
        display_phone_number: accountInfo.displayPhoneNumber,
        verified_name: accountInfo.verifiedName,
        account_type: 'business',
        is_active: true,
      },
    };

    const { data, error } = await supabase
      .from('channel_accounts')
      .upsert(record, {
        onConflict: 'organization_id,provider,external_id',
      })
      .select('*')
      .single();

    if (error) {
      logger.error('whatsapp.upsert_account_failed', error);
    }

    return data;
  }

  async reconcileWhatsAppAccount(organizationId: string, connectionId: string, accountInfo: {
    phoneNumberId: string; verifiedName: string; displayPhoneNumber: string; wabaId: string;
  }) {
    const supabase = createSupabaseAdminClient();
    const { data: existing, error: lookupError } = await supabase
      .from('channel_accounts').select('id')
      .eq('organization_id', organizationId).eq('connection_id', connectionId).eq('provider', 'whatsapp');
    if (lookupError || (existing?.length ?? 0) > 1) {
      logger.error('whatsapp.reconcile_account_lookup_failed');
      throw new Error('Failed to reconcile WhatsApp account safely.');
    }
    if (!existing?.length) return this.upsertWhatsAppAccount(organizationId, connectionId, accountInfo);
    const { data, error } = await supabase.from('channel_accounts').update({
      external_id: accountInfo.phoneNumberId,
      display_name: accountInfo.verifiedName || accountInfo.displayPhoneNumber || 'WhatsApp Business',
      metadata: { waba_id: accountInfo.wabaId, display_phone_number: accountInfo.displayPhoneNumber,
        verified_name: accountInfo.verifiedName, account_type: 'business', is_active: true },
    }).eq('id', existing[0].id).eq('organization_id', organizationId).select('*').single();
    if (error) {
      logger.error('whatsapp.reconcile_account_failed');
      throw new Error('Failed to reconcile WhatsApp account.');
    }
    return data;
  }

  /**
   * Stores encrypted access token in integration_tokens using exact 0027 migration unique constraint (connection_id).
   */
  async storeWhatsAppTokens(payload: WhatsAppTokenPayload) {
    const supabase = createSupabaseAdminClient();
    const record = {
      organization_id: payload.organizationId,
      connection_id: payload.connectionId,
      provider: 'whatsapp',
      token_type: payload.tokenType || 'bearer',
      access_token_cipher: payload.accessTokenCipher,
      scopes: payload.scopes || ['whatsapp_business_management', 'whatsapp_business_messaging'],
      expires_at: payload.expiresAt || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('integration_tokens')
      .upsert(record, {
        onConflict: 'connection_id',
      })
      .select('*')
      .single();

    if (error) {
      logger.error('whatsapp.store_token_failed', error);
      throw new Error('Failed to store encrypted WhatsApp tokens.');
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
      logger.error('whatsapp.get_token_failed', error);
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
        updated_by: userId,
      })
      .eq('id', connectionId)
      .eq('organization_id', organizationId)
      .select('*')
      .single();

    if (error) {
      logger.error('whatsapp.disconnect_connection_failed', error);
      throw new Error('Failed to disconnect WhatsApp connection.');
    }

    return data;
  }

  /**
   * Updates health check status on connection.
   */
  async updateHealthCheckStatus(
    connectionId: string,
    status: 'connected' | 'error' | 'expired' | 'revoked',
    errorCode?: string,
    errorMessage?: string
  ) {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      status,
      last_health_check_at: now,
      connection_error_code: errorCode || null,
      connection_error_message: errorMessage || null,
    };

    if (status === 'connected') {
      updates.connection_verified_at = now;
    } else if (status === 'revoked') {
      updates.disconnected_at = now;
    }

    const { data, error } = await supabase
      .from('channel_connections')
      .update(updates)
      .eq('id', connectionId)
      .select('*')
      .single();

    if (error) {
      logger.error('whatsapp.update_health_status_failed', error);
    }

    return data;
  }

  /**
   * Atomically registers and consumes an authorization code hash via PostgreSQL SECURITY DEFINER RPC.
   */
  async consumeAuthCode(
    organizationId: string,
    userId: string,
    provider: string,
    codeHash: string,
    ttlSeconds = 600
  ): Promise<{ status: 'consumed' | 'already_used' | 'expired' }> {
    const supabase = createSupabaseAdminClient();

    try {
      const { data, error } = await supabase.rpc('consume_whatsapp_authorization_code', {
        p_provider: provider,
        p_code_hash: codeHash,
        p_organization_id: organizationId,
        p_user_id: userId,
        p_ttl_seconds: ttlSeconds,
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        const resultStatus = String(data[0].status);
        if (resultStatus === 'consumed' || resultStatus === 'already_used' || resultStatus === 'expired') {
          return { status: resultStatus };
        }
      }
    } catch (err) {
      logger.warn('whatsapp.consume_auth_code_rpc_fallback', { error: err instanceof Error ? err.message : String(err) });
    }

    // Fallback for local unit test environment when RPC is not in DB
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const consumedAt = now.toISOString();

    const { data: existing, error: selectErr } = await supabase
      .from('oauth_authorization_codes')
      .select('id, organization_id, user_id, consumed_at, expires_at')
      .eq('provider', provider)
      .eq('code_hash', codeHash)
      .maybeSingle();

    if (selectErr) {
      logger.error('whatsapp.select_auth_code_failed', selectErr);
      throw new Error('Failed to verify authorization code idempotency.');
    }

    if (existing) {
      if (existing.organization_id !== organizationId || existing.user_id !== userId) {
        return { status: 'already_used' };
      }
      if (existing.consumed_at) {
        return { status: 'already_used' };
      }
      if (new Date(existing.expires_at) < now) {
        return { status: 'expired' };
      }
      const { data: updated, error: updateErr } = await supabase
        .from('oauth_authorization_codes')
        .update({ consumed_at: consumedAt })
        .eq('id', existing.id)
        .is('consumed_at', null)
        .select('id')
        .maybeSingle();

      if (updateErr || !updated) {
        return { status: 'already_used' };
      }
      return { status: 'consumed' };
    }

    const { error: insertErr } = await supabase
      .from('oauth_authorization_codes')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        provider,
        code_hash: codeHash,
        expires_at: expiresAt,
        consumed_at: consumedAt,
      });

    if (insertErr) {
      if (insertErr.code === '23505') {
        return { status: 'already_used' };
      }
      logger.error('whatsapp.insert_auth_code_failed', insertErr);
      throw new Error('Failed to record authorization code idempotency.');
    }

    return { status: 'consumed' };
  }
}
