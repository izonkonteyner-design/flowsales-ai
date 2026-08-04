import { MetaGraphClient } from './meta-graph-client';
import { WhatsAppConnectionsRepository } from '@/server/repositories/supabase/whatsapp-connections';
import { decryptToken } from './encryption';

export interface DisconnectResult {
  success: boolean;
  status: 'revoked';
  disconnectedAt: string;
  webhookUnsubscribed: boolean;
}

export class WhatsAppDisconnectService {
  private readonly repository: WhatsAppConnectionsRepository;
  private readonly metaClient: MetaGraphClient;

  constructor(repository?: WhatsAppConnectionsRepository, metaClient?: MetaGraphClient) {
    this.repository = repository || new WhatsAppConnectionsRepository();
    this.metaClient = metaClient || new MetaGraphClient();
  }

  async disconnect(organizationId: string, userId: string): Promise<DisconnectResult> {
    const connection = await this.repository.getWhatsAppConnectionForOrg(organizationId);
    if (!connection) {
      return {
        success: true,
        status: 'revoked',
        disconnectedAt: new Date().toISOString(),
        webhookUnsubscribed: false,
      };
    }

    if (connection.status === 'revoked') {
      return {
        success: true,
        status: 'revoked',
        disconnectedAt: connection.disconnected_at || new Date().toISOString(),
        webhookUnsubscribed: false,
      };
    }

    let webhookUnsubscribed = false;
    try {
      const tokenRecord = await this.repository.getWhatsAppToken(connection.id);
      if (tokenRecord && tokenRecord.access_token_cipher) {
        const accessToken = decryptToken(tokenRecord.access_token_cipher);
        if (connection.waba_id) {
          webhookUnsubscribed = await this.metaClient.unsubscribeWabaFromApp(connection.waba_id, accessToken);
        }
      }
    } catch (err) {
      console.warn('[WhatsAppDisconnect] Failed to unsubscribe webhook during disconnect:', err);
    }

    const updatedConn = await this.repository.disconnectWhatsAppConnection(organizationId, connection.id, userId);

    return {
      success: true,
      status: 'revoked',
      disconnectedAt: updatedConn.disconnected_at || new Date().toISOString(),
      webhookUnsubscribed,
    };
  }
}
