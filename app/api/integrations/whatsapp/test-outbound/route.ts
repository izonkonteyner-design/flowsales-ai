import { NextResponse } from 'next/server';
import { WhatsAppOutboundService } from '@/server/services/integrations/whatsapp-outbound';
import { createSupabaseAdminClient } from '@/lib/supabase/server-admin';

export const dynamic = 'force-dynamic';

const orgId = 'f11c1551-8b3a-4a18-ad6e-0ab16c061920';
const userId = '02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0';
const conversationId = '77777777-7777-4777-a777-777777777777';

export async function POST(request: Request) {
  const reqSession = (request.headers.get('x-ingest-session') || '').trim();
  const supabase = createSupabaseAdminClient();

  if (!reqSession.startsWith('ingest_session_') || reqSession.length < 40) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: sessionRow } = await supabase
    .from('oauth_states')
    .select('id, expires_at')
    .eq('state_hash', reqSession)
    .eq('provider', 'whatsapp')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!sessionRow) {
    return NextResponse.json({ error: 'Unauthorized or expired session' }, { status: 401 });
  }

  await supabase.from('oauth_states').delete().eq('id', sessionRow.id);

  try {
    const outboundService = new WhatsAppOutboundService();
    const result = await outboundService.sendOutboundReply({
      organizationId: orgId,
      userId,
      userRole: 'owner',
      conversationId,
      text: 'FlowSales AI Status Lifecycle Test - Allowlisted Recipient',
      clientIdempotencyKey: `test_lifecycle_${Date.now()}`,
      isTestMode: true,
    });

    if (!result.success || !result.data) {
      return NextResponse.json({ error: result.errorCode || 'send_failed', message: result.message }, { status: 500 });
    }

    const { externalId, messageId, status } = result.data;

    const { data: dbMsg } = await supabase
      .from('messages')
      .select('id, conversation_id, organization_id, external_id, status, sent_at, delivered_at, read_at, failed_at, error_code, created_at')
      .eq('id', messageId)
      .single();

    return NextResponse.json({
      success: true,
      wamid: externalId,
      externalId,
      messageId,
      status,
      persistedDbMessage: dbMsg,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 });
  }
}
