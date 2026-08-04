import { validateWhatsAppServerConfig } from './whatsapp-config';
import { MetaGraphClient, MetaGraphError } from './meta-graph-client';
import { WhatsAppConnectionsRepository } from '@/server/repositories/supabase/whatsapp-connections';
import { decryptToken } from './encryption';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'expired' | 'revoked' | 'configuration_required' | 'error';
  wabaAccess: boolean;
  phoneNumberAccess: boolean;
  webhookSubscribed: boolean;
  checkedAt: string;
  errorCode?: string;
  errorMessage?: string;
}

export class WhatsAppHealthCheckService {
  private readonly repository: WhatsAppConnectionsRepository;
  private readonly metaClient: MetaGraphClient;

  constructor(repository?: WhatsAppConnectionsRepository, metaClient?: MetaGraphClient) {
    this.repository = repository || new WhatsAppConnectionsRepository();
    this.metaClient = metaClient || new MetaGraphClient();
  }

  async runHealthCheck(organizationId: string): Promise<HealthCheckResult> {
    const checkedAt = new Date().toISOString();

    const configCheck = validateWhatsAppServerConfig();
    if (!configCheck.valid) {
      return {
        status: 'configuration_required',
        wabaAccess: false,
        phoneNumberAccess: false,
        webhookSubscribed: false,
        checkedAt,
        errorCode: configCheck.errorCode,
        errorMessage: configCheck.errorMessage,
      };
    }

    const connection = await this.repository.getWhatsAppConnectionForOrg(organizationId);
    if (!connection) {
      return {
        status: 'error',
        wabaAccess: false,
        phoneNumberAccess: false,
        webhookSubscribed: false,
        checkedAt,
        errorCode: 'connection_not_found',
        errorMessage: 'No WhatsApp Business connection found for this workspace.',
      };
    }

    if (connection.status === 'revoked') {
      return {
        status: 'revoked',
        wabaAccess: false,
        phoneNumberAccess: false,
        webhookSubscribed: false,
        checkedAt,
        errorCode: 'connection_revoked',
        errorMessage: 'WhatsApp connection was disconnected or revoked.',
      };
    }

    const tokenRecord = await this.repository.getWhatsAppToken(connection.id);
    if (!tokenRecord || !tokenRecord.access_token_cipher) {
      await this.repository.updateHealthCheckStatus(connection.id, 'error', 'token_missing', 'Encrypted access token is missing.');
      return {
        status: 'error',
        wabaAccess: false,
        phoneNumberAccess: false,
        webhookSubscribed: false,
        checkedAt,
        errorCode: 'token_missing',
        errorMessage: 'Encrypted access token is missing.',
      };
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(tokenRecord.access_token_cipher);
    } catch {
      await this.repository.updateHealthCheckStatus(connection.id, 'error', 'token_decryption_failed', 'Failed to decrypt access token.');
      return {
        status: 'error',
        wabaAccess: false,
        phoneNumberAccess: false,
        webhookSubscribed: false,
        checkedAt,
        errorCode: 'token_decryption_failed',
        errorMessage: 'Failed to decrypt access token.',
      };
    }

    try {
      const wabaInfo = await this.metaClient.getWabaDetails(connection.waba_id, accessToken);
      const wabaAccess = Boolean(wabaInfo.id);

      const phoneNumbers = await this.metaClient.getWabaPhoneNumbers(connection.waba_id, accessToken);
      const phoneNumberAccess = phoneNumbers.some(p => p.id === connection.phone_number_id);

      const webhookSubscribed = Boolean(connection.webhook_subscribed_at);

      const isHealthy = wabaAccess && phoneNumberAccess;
      const status = isHealthy ? 'healthy' : 'degraded';

      await this.repository.updateHealthCheckStatus(connection.id, isHealthy ? 'connected' : 'error');

      return {
        status,
        wabaAccess,
        phoneNumberAccess,
        webhookSubscribed,
        checkedAt,
      };
    } catch (err: unknown) {
      const isMetaErr = err instanceof MetaGraphError;
      const errCode = isMetaErr ? err.code : 'health_check_failed';
      const errMsg = err instanceof Error ? err.message : 'WhatsApp health check failed.';
      const isExpired = errCode === 'code_already_used' || errMsg.includes('expired') || errMsg.includes('OAuth');
      const status = isExpired ? 'expired' : 'error';

      await this.repository.updateHealthCheckStatus(connection.id, isExpired ? 'expired' : 'error', errCode, errMsg);

      return {
        status,
        wabaAccess: false,
        phoneNumberAccess: false,
        webhookSubscribed: false,
        checkedAt,
        errorCode: errCode,
        errorMessage: errMsg,
      };
    }
  }
}
