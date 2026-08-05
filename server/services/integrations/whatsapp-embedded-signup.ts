import * as crypto from 'node:crypto';
import { validateWhatsAppServerConfig } from './whatsapp-config';
import { MetaGraphClient, MetaGraphError } from './meta-graph-client';
import { WhatsAppConnectionsRepository } from '@/server/repositories/supabase/whatsapp-connections';
import { encryptToken } from './encryption';
import { logger } from '@/lib/logger';

export interface ProcessEmbeddedSignupInput {
  organizationId: string;
  userId: string;
  code: string;
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
}

export interface ProcessEmbeddedSignupResult {
  success: boolean;
  connectionId?: string;
  status: 'connected' | 'connecting' | 'error';
  errorCode?: string;
  errorMessage?: string;
  displayName?: string;
  wabaId?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  webhookSubscribed?: boolean;
}

export class WhatsAppEmbeddedSignupService {
  private readonly repository: WhatsAppConnectionsRepository;
  private readonly metaClient: MetaGraphClient;

  constructor(repository?: WhatsAppConnectionsRepository, metaClient?: MetaGraphClient) {
    this.repository = repository || new WhatsAppConnectionsRepository();
    this.metaClient = metaClient || new MetaGraphClient();
  }

  async processEmbeddedSignup(input: ProcessEmbeddedSignupInput): Promise<ProcessEmbeddedSignupResult> {
    // 1. Server configuration check (fail closed)
    const serverConfigStatus = validateWhatsAppServerConfig();
    if (!serverConfigStatus.valid) {
      return {
        success: false,
        status: 'error',
        errorCode: serverConfigStatus.errorCode || 'configuration_required',
        errorMessage: serverConfigStatus.errorMessage || 'WhatsApp integration is not properly configured.',
      };
    }

    if (!input.code || typeof input.code !== 'string' || !input.code.trim()) {
      return {
        success: false,
        status: 'error',
        errorCode: 'invalid_code',
        errorMessage: 'Authorization code is required.',
      };
    }

    // 2. Authorization code replay protection (SHA-256 hash check)
    const codeHash = crypto.createHash('sha256').update(input.code.trim()).digest('hex');
    const codeConsumption = await this.repository.consumeAuthCode(
      input.organizationId,
      input.userId,
      'whatsapp',
      codeHash
    );

    if (codeConsumption.status === 'already_used') {
      return {
        success: false,
        status: 'error',
        errorCode: 'authorization_code_already_used',
        errorMessage: 'This authorization code has already been used.',
      };
    }

    if (codeConsumption.status === 'expired') {
      return {
        success: false,
        status: 'error',
        errorCode: 'authorization_code_expired',
        errorMessage: 'The authorization code has expired.',
      };
    }

    try {
      // 3. Exchange authorization code for system user access token
      const tokenResp = await this.metaClient.exchangeCodeForToken(input.code);

      // 4. WABA and Phone Number Discovery
      const targetWabaId = input.wabaId;
      if (!targetWabaId) {
        throw new MetaGraphError('WABA ID is required to complete WhatsApp setup.', 'missing_waba_id', 400);
      }

      const wabaInfo = await this.metaClient.getWabaDetails(targetWabaId, tokenResp.access_token);
      const phoneNumbers = await this.metaClient.getWabaPhoneNumbers(targetWabaId, tokenResp.access_token);

      if (!phoneNumbers || phoneNumbers.length === 0) {
        throw new MetaGraphError('No WhatsApp phone numbers found for the selected WABA.', 'no_phone_numbers', 400);
      }

      // 5. Strict Phone Selection Validation (no silent fallback to first phone if explicit ID provided)
      let primaryPhone = phoneNumbers[0];
      if (input.phoneNumberId) {
        const found = phoneNumbers.find(p => p.id === input.phoneNumberId);
        if (!found) {
          return {
            success: false,
            status: 'error',
            errorCode: 'selected_phone_number_not_found',
            errorMessage: 'The selected phone number was not found in your WhatsApp Business Account.',
          };
        }
        primaryPhone = found;
      }

      // 6. Cross-workspace Conflict Check (fail closed)
      const existing = await this.repository.findGlobalExistingConnection(targetWabaId, primaryPhone.id);
      if (existing && existing.organization_id !== input.organizationId) {
        return {
          success: false,
          status: 'error',
          errorCode: 'waba_already_connected_to_another_workspace',
          errorMessage: 'This WhatsApp Business Account or phone number is already connected to another workspace.',
        };
      }

      // 7. Encrypt token using AES-256-GCM
      const encryptedToken = encryptToken(tokenResp.access_token);
      const tokenExpiresAt = tokenResp.expires_in
        ? new Date(Date.now() + tokenResp.expires_in * 1000).toISOString()
        : undefined;

      // 8. Save initial connection record ('connecting' state)
      const connection = await this.repository.upsertWhatsAppConnection({
        organizationId: input.organizationId,
        wabaId: targetWabaId,
        phoneNumberId: primaryPhone.id,
        businessId: input.businessId,
        verifiedName: primaryPhone.verified_name || 'WhatsApp Business',
        displayPhoneNumber: primaryPhone.display_phone_number,
        qualityRating: primaryPhone.quality_rating,
        messagingLimitTier: primaryPhone.messaging_limit_tier,
        codeVerificationStatus: primaryPhone.code_verification_status,
        accountReviewStatus: wabaInfo.account_review_status,
        tokenExpiresAt,
        createdBy: input.userId,
        status: 'connecting',
      });

      // 9. Save channel_accounts record
      await this.repository.upsertWhatsAppAccount(input.organizationId, connection.id, {
        phoneNumberId: primaryPhone.id,
        verifiedName: primaryPhone.verified_name || 'WhatsApp Business',
        displayPhoneNumber: primaryPhone.display_phone_number,
        wabaId: targetWabaId,
      });

      // 10. Store encrypted token record
      await this.repository.storeWhatsAppTokens({
        organizationId: input.organizationId,
        connectionId: connection.id,
        accessTokenCipher: encryptedToken,
        expiresAt: tokenExpiresAt,
      });

      // 11. Subscribe WABA to app webhooks (fail-closed check)
      const webhookSubscribed = await this.metaClient.subscribeWabaToApp(targetWabaId, tokenResp.access_token);
      if (!webhookSubscribed) {
        await this.repository.upsertWhatsAppConnection({
          organizationId: input.organizationId,
          wabaId: targetWabaId,
          phoneNumberId: primaryPhone.id,
          businessId: input.businessId,
          verifiedName: primaryPhone.verified_name || 'WhatsApp Business',
          displayPhoneNumber: primaryPhone.display_phone_number,
          createdBy: input.userId,
          status: 'error',
          errorCode: 'webhook_subscription_failed',
          errorMessage: 'Failed to subscribe WhatsApp Business Account to application webhooks.',
        });

        return {
          success: false,
          status: 'error',
          errorCode: 'webhook_subscription_failed',
          errorMessage: 'Failed to subscribe WhatsApp Business Account to application webhooks.',
        };
      }

      const webhookSubscribedAt = new Date().toISOString();

      // 12. Update connection status to 'connected'
      const updatedConn = await this.repository.upsertWhatsAppConnection({
        organizationId: input.organizationId,
        wabaId: targetWabaId,
        phoneNumberId: primaryPhone.id,
        businessId: input.businessId,
        verifiedName: primaryPhone.verified_name || 'WhatsApp Business',
        displayPhoneNumber: primaryPhone.display_phone_number,
        qualityRating: primaryPhone.quality_rating,
        messagingLimitTier: primaryPhone.messaging_limit_tier,
        codeVerificationStatus: primaryPhone.code_verification_status,
        accountReviewStatus: wabaInfo.account_review_status,
        webhookSubscribedAt,
        tokenExpiresAt,
        createdBy: input.userId,
        status: 'connected',
      });

      return {
        success: true,
        connectionId: updatedConn.id,
        status: 'connected',
        displayName: updatedConn.display_name,
        wabaId: targetWabaId,
        phoneNumberId: primaryPhone.id,
        displayPhoneNumber: primaryPhone.display_phone_number,
        verifiedName: primaryPhone.verified_name,
        webhookSubscribed: true,
      };
    } catch (err: unknown) {
      const errorCode = err instanceof MetaGraphError ? err.code : 'connection_failed';
      const errorMessage = err instanceof Error ? err.message : 'WhatsApp connection failed.';

      logger.error('whatsapp.embedded_signup_error', err, {
        organizationId: input.organizationId,
        errorCode,
      });

      return {
        success: false,
        status: 'error',
        errorCode,
        errorMessage,
      };
    }
  }
}
