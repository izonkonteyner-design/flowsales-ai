import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { WhatsAppTemplateService } from '@/server/services/integrations/whatsapp-template-service';
import { WhatsAppOutboundService } from '@/server/services/integrations/whatsapp-outbound';

export const dynamic = 'force-dynamic';

const orgId = 'f11c1551-8b3a-4a18-ad6e-0ab16c061920';
const userId = '02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0';
const conversationId = '77777777-7777-4777-a777-777777777777';

export async function POST(request: Request) {
  const reqSession = (request.headers.get('x-ingest-session') || '').trim();
  const action = (request.headers.get('x-action') || 'sync').trim();
  const supabase = createSupabaseAdminClient();

  if (!reqSession.startsWith('ingest_session_') || reqSession.length < 40) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: sessionRow } = await supabase
    .from('oauth_states')
    .select('id')
    .eq('state_hash', reqSession)
    .eq('provider', 'whatsapp')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!sessionRow) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await supabase.from('oauth_states').delete().eq('id', sessionRow.id);

  if (action === 'send_template') {
    try {
      const templateService = new WhatsAppTemplateService();
      const res = await templateService.sendTemplateMessage({
        organizationId: orgId,
        userId,
        userRole: 'owner',
        conversationId,
        templateName: 'hello_world',
        languageCode: 'en_US',
        clientIdempotencyKey: `test_tpl_${Date.now()}`,
        isTestMode: true,
      });

      return NextResponse.json(res);
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Template send failed' }, { status: 500 });
    }
  }

  if (action === 'send_freeform') {
    try {
      const outboundService = new WhatsAppOutboundService();
      const res = await outboundService.sendOutboundReply({
        organizationId: orgId,
        userId,
        userRole: 'owner',
        conversationId,
        text: 'Test free-form reply after 24h window reopening',
        clientIdempotencyKey: `test_freeform_${Date.now()}`,
        isTestMode: true,
      });

      return NextResponse.json(res);
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Free-form send failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, message: 'Session validated' });
}
