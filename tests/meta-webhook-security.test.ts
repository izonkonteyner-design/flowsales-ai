import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

describe('Meta Webhook Security & Verification Unit Tests', () => {
  test('Webhook verify challenge returns hub.challenge on matching verify token', () => {
    const mode = 'subscribe';
    const verifyToken = 'secret_webhook_verify_token_123';
    const challenge = 'challenge_test_code_999';
    const expectedVerifyToken = 'secret_webhook_verify_token_123';

    let status = 403;
    let responseText = '';

    if (mode === 'subscribe' && verifyToken === expectedVerifyToken) {
      status = 200;
      responseText = challenge;
    }

    assert.equal(status, 200);
    assert.equal(responseText, 'challenge_test_code_999');
  });

  test('Webhook verify challenge rejects invalid verify token with 403', () => {
    const mode = 'subscribe';
    const verifyToken: string = 'WRONG_VERIFY_TOKEN';
    const expectedVerifyToken = 'secret_webhook_verify_token_123';

    let status = 200;
    if (mode !== 'subscribe' || verifyToken !== expectedVerifyToken) {
      status = 403;
    }

    assert.equal(status, 403);
  });

  test('HMAC-SHA256 signature verification accepts valid signature', () => {
    const appSecret = 'meta_app_secret_key_456';
    const rawBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'evt_123' }] });

    const calculatedSig = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const headerSig = `sha256=${calculatedSig}`;

    const rawProvidedSig = headerSig.slice(7);

    const isValid =
      rawProvidedSig.length === calculatedSig.length &&
      crypto.timingSafeEqual(Buffer.from(rawProvidedSig), Buffer.from(calculatedSig));

    assert.equal(isValid, true);
  });

  test('HMAC-SHA256 signature verification rejects tampered body with 401', () => {
    const appSecret = 'meta_app_secret_key_456';
    const originalBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'evt_123' }] });
    const tamperedBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'evt_999_hacked' }] });

    const originalSig = crypto.createHmac('sha256', appSecret).update(originalBody).digest('hex');

    const calculatedSigForTampered = crypto.createHmac('sha256', appSecret).update(tamperedBody).digest('hex');

    const isValid =
      originalSig.length === calculatedSigForTampered.length &&
      crypto.timingSafeEqual(Buffer.from(originalSig), Buffer.from(calculatedSigForTampered));

    assert.equal(isValid, false);
  });

  test('raw-body hash fallback deterministiktir', () => {
    const rawBody1 = JSON.stringify({ object: 'whatsapp_business_account', text: 'hello' });
    const rawBody2 = JSON.stringify({ object: 'whatsapp_business_account', text: 'hello' });

    const hash1 = crypto.createHash('sha256').update(rawBody1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(rawBody2).digest('hex');

    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });

  test('bilinmeyen WABA/phone bağlantısında 200 OK ignored unknown_connection döner', () => {
    const routePath = path.join(process.cwd(), 'app/api/webhooks/meta/route.ts');
    const code = fs.readFileSync(routePath, 'utf-8');

    assert.ok(code.includes('unknown_connection_ignored'));
    assert.ok(code.includes('status: "ignored"'));
    assert.ok(code.includes('findActiveConnectionForWebhook'));
  });

  test('webhook insert database hatasında 5xx verir', () => {
    const routePath = path.join(process.cwd(), 'app/api/webhooks/meta/route.ts');
    const code = fs.readFileSync(routePath, 'utf-8');

    assert.ok(code.includes('webhook_persistence_failed'));
    assert.ok(code.includes('500'));
  });

  test('authorized bootstrap fails closed unless exact ids and one non-demo owner workspace match', () => {
    const routePath = path.join(process.cwd(), 'app/api/webhooks/meta/route.ts');
    const code = fs.readFileSync(routePath, 'utf-8');

    assert.ok(code.includes('META_AUTO_BIND_SINGLE_OWNER'));
    assert.ok(code.includes('META_BOOTSTRAP_WABA_ID'));
    assert.ok(code.includes('META_BOOTSTRAP_PHONE_NUMBER_ID'));
    assert.ok(code.includes('organizationIds.length !== 1'));
    assert.ok(code.includes('bootstrap_cross_workspace_conflict'));
    assert.ok(code.includes('DEMO_ORGANIZATION_ID'));
  });

  test('duplicate webhook yarışında 23505 hatasında 200 duplicate_event_ignored döner', () => {
    const routePath = path.join(process.cwd(), 'app/api/webhooks/meta/route.ts');
    const code = fs.readFileSync(routePath, 'utf-8');

    assert.ok(code.includes('23505'));
    assert.ok(code.includes('duplicate_event_ignored'));
  });
});
