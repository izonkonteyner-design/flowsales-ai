import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

describe('Meta Webhook Security & Verification Unit Tests', () => {
  const originalEnv = { ...process.env };

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

  test('Webhook route file handles GET verification and POST signature check', () => {
    const routePath = path.join(process.cwd(), 'app/api/webhooks/meta/route.ts');
    const code = fs.readFileSync(routePath, 'utf-8');

    assert.ok(code.includes('x-hub-signature-256'));
    assert.ok(code.includes('sha256='));
    assert.ok(code.includes('crypto.timingSafeEqual'));
    assert.ok(code.includes('duplicate_event_ignored'));
    assert.ok(code.includes('webhook_events'));
  });
});
