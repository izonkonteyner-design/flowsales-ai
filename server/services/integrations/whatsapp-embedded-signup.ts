import { validateWhatsAppServerConfig } from './whatsapp-config';
import { MetaGraphClient, MetaGraphError } from './meta-graph-client';
import { WhatsAppConnectionsRepository } from '@/server/repositories/supabase/whatsapp-connections';
import { encryptToken } from './encryption';

export interface ProcessEmbeddedSignupInput {
  organizationId: string;
  userId: string;
  code: string;
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
}

export interface WhatsAppConnectionResult {
  success: boolean;
  connectionId?: string;
  status: 'connected' | 'error';
  displayName?: string;
  wabaId?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  webhookSubscribed?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export class WhatsAppEmbeddedSignupService {
  private readonly repository: WhatsAppConnectionsRepository;
  private readonly metaClient: MetaGraphClient;

  constructor(repository?: WhatsAppConnectionsRepository, metaClient?: MetaGraphClient) {
    this.repository = repository || new WhatsAppConnectionsRepository();
    this.metaClient = metaClient || new MetaGraphClient();
  }

  async processEmbeddedSignup(input: ProcessEmbeddedSignupInput): Promise<WhatsAppConnectionResult> {
    // 1. Fail-closed server configuration checks
    const configCheck = validateWhatsAppServerConfig();
    if (!configCheck.valid) {
      return {
        success: false,
        status: 'error',
        errorCode: configCheck.errorCode,
        errorMessage: configCheck.errorMessage,
      };
    }

    if (!input.code || typeof input.code !== 'string' || input.code.trim().length === 0) {
      return {
        success: false,
        status: 'error',
        errorCode: 'invalid_code',
        errorMessage: 'Authorization code is required.',
      };
    }

    try {
      // 2. Exchange authorization code for system user access token
      const tokenResp = await this.metaClient.exchangeCodeForToken(input.code);

      // 3. WABA and Phone Number Discovery
      let targetWabaId = input.wabaId;
      if (!targetWabaId) {
        throw new MetaGraphError('WABA ID is required to complete WhatsApp setup.', 'missing_waba_id', 400);
      }

      const wabaInfo = await this.metaClient.getWabaDetails(targetWabaId, tokenResp.access_token);
      const phoneNumbers = await this.metaClient.getWabaPhoneNumbers(targetWabaId, tokenResp.access_token);

      if (!phoneNumbers || phoneNumbers.length === 0) {
        throw new MetaGraphError('No WhatsApp phone numbers found for the selected WABA.', 'no_phone_numbers', 400);
      }

      // Pick selected phone number or first available
      const primaryPhone = input.phoneNumberId
        ? phoneNumbers.find(p => p.id === input.phoneNumberId) || phoneNumbers[0]
        : phoneNumbers[0];

      // 4. Conflict check: WABA or phone_number_id already connected in ANOTHER workspace?
      const existing = await this.repository.findGlobalExistingConnection(targetWabaId, primaryPhone.id);
      if (existing && existing.organization_id !== input.organizationId) {
        return {
          success: false,
          status: 'error',
          errorCode: 'waba_already_connected_to_another_workspace',
          errorMessage: 'This WhatsApp Business Account or phone number is already connected to another workspace.',
        };
      }

      // 5. Encrypt token using AES-256-GCM
      const encryptedToken = encryptToken(tokenResp.access_token);
      const tokenExpiresAt = tokenResp.expires_in
        ? new Date(Date.now() + tokenResp.expires_in * 1000).toISOString()
        : undefined;

      // 6. Save connection record
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
        status: 'connecting', // temporary state before webhook subscription
      });

      // 7. Save channel_accounts record
      await this.repository.upsertWhatsAppAccount(input.organizationId, connection.id, {
        phoneNumberId: primaryPhone.id,
        verifiedName: primaryPhone.verified_name || 'WhatsApp Business',
        displayPhoneNumber: primaryPhone.display_phone_number,
        wabaId: targetWabaId,
      });

      // 8. Store encrypted token record
      await this.repository.storeWhatsAppTokens({
        organizationId: input.organizationId,
        connectionId: connection.id,
        accessTokenCipher: encryptedToken,
        expiresAt: tokenExpiresAt,
      });

      // 9. Subscribe WABA to app webhooks
      const webhookSubscribed = await this.metaClient.subscribeWabaToApp(targetWabaId, tokenResp.access_token);
      const webhookSubscribedAt = webhookSubscribed ? new Date().toISOString() : undefined;

      // 10. Update connection status to 'connected'
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
        webhookSubscribed,
      };
    } catch (err: any) {
      const errorCode = err instanceof MetaGraphError ? err.code : 'connection_failed';
      const errorMessage = err.message || 'WhatsApp connection failed.';

      // Record error on connection row if possible
      try {
        await this.repository.upsertWhatsAppConnection({
          organizationId: input.organizationId,
          wabaId: input.wabaId || 'unknown',
          phoneNumberId: input.phoneNumberId || 'unknown',
          verifiedName: 'WhatsApp Business',
          displayPhoneNumber: '',
          createdBy: input.userId,
          status: 'error',
          errorCode,
          errorMessage,
        });
      } catch {
        // Ignore fallback record error
      }

      return {
        success: false,
        status: 'error',
        errorCode,
        errorMessage,
      };
    }
  }
}
