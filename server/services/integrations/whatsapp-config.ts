import { isTokenEncryptionConfigured } from './encryption';

export interface WhatsAppConfig {
  appId: string;
  appSecret: string;
  configId: string;
  apiVersion: string;
  webhookVerifyToken: string;
  siteUrl: string;
  isPublicConfigured: boolean;
  isServerConfigured: boolean;
  isEncryptionConfigured: boolean;
}

export function getWhatsAppConfig(): WhatsAppConfig {
  const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || '';
  const appSecret = process.env.META_APP_SECRET || '';
  const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID || '';
  const apiVersion = process.env.META_GRAPH_API_VERSION || 'v21.0';
  const webhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || '';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const isPublicConfigured = Boolean(appId && configId);
  const isServerConfigured = Boolean(appId && appSecret && configId && webhookVerifyToken);
  const isEncryptionConfigured = isTokenEncryptionConfigured();

  return {
    appId,
    appSecret,
    configId,
    apiVersion,
    webhookVerifyToken,
    siteUrl,
    isPublicConfigured,
    isServerConfigured,
    isEncryptionConfigured,
  };
}

export function validateWhatsAppPublicConfig(): { valid: boolean; errorCode?: string; errorMessage?: string } {
  const config = getWhatsAppConfig();
  if (!config.isPublicConfigured) {
    return {
      valid: false,
      errorCode: 'configuration_required',
      errorMessage: 'Meta App ID and Embedded Signup Config ID must be configured in environment variables.',
    };
  }
  return { valid: true };
}

export function validateWhatsAppServerConfig(): { valid: boolean; errorCode?: string; errorMessage?: string } {
  const config = getWhatsAppConfig();
  if (!config.isEncryptionConfigured) {
    return {
      valid: false,
      errorCode: 'token_encryption_not_configured',
      errorMessage: 'TOKEN_ENCRYPTION_KEY is missing or invalid. Encryption key must be a 64-character hex string or 32-byte base64 string.',
    };
  }
  if (!config.isServerConfigured) {
    return {
      valid: false,
      errorCode: 'configuration_required',
      errorMessage: 'Meta App ID, App Secret, Config ID, and Webhook Verify Token must be configured in server environment variables.',
    };
  }
  return { valid: true };
}
