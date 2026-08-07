import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { decryptToken } from '@/server/services/integrations/encryption';
import { WhatsAppTemplateService } from '@/server/services/integrations/whatsapp-template-service';

export const dynamic = 'force-dynamic';

const orgId = 'f11c1551-8b3a-4a18-ad6e-0ab16c061920';
const userId = '02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0';
const wabaId = '4238908486357701';
const conversationId = '77777777-7777-4777-a777-777777777777';

export async function POST(request: Request) {
  const reqSession = (request.headers.get('x-ingest-session') || '').trim();
  const action = (request.headers.get('x-action') || 'list').trim();
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

  const { data: tokenRow } = await supabase
    .from('integration_tokens')
    .select('connection_id, access_token_cipher')
    .eq('organization_id', orgId)
    .eq('provider', 'whatsapp')
    .single();

  if (!tokenRow?.access_token_cipher) {
    return NextResponse.json({ error: 'Missing access token' }, { status: 500 });
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(tokenRow.access_token_cipher);
  } catch (err: unknown) {
    return NextResponse.json({ error: 'Failed to decrypt access token', details: String(err) }, { status: 500 });
  }

  const graphVersion = process.env.META_GRAPH_API_VERSION || 'v21.0';

  if (action === 'list') {
    const url = `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates?limit=100`;
    const metaRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const metaJson = await metaRes.json();
    if (!metaRes.ok) {
      return NextResponse.json({ error: 'Meta API error', details: metaJson }, { status: metaRes.status });
    }

    const liveTemplates = Array.isArray(metaJson.data) ? metaJson.data : [];
    const nowIso = new Date().toISOString();
    const liveKeys = new Set<string>();

    for (const tpl of liveTemplates) {
      const key = `${tpl.name}:${tpl.language}`;
      liveKeys.add(key);

      await supabase
        .from('whatsapp_templates')
        .upsert(
          {
            organization_id: orgId,
            connection_id: tokenRow.connection_id,
            meta_template_id: tpl.id,
            name: tpl.name,
            language: tpl.language,
            category: tpl.category || 'UTILITY',
            status: tpl.status,
            components: tpl.components || [],
            last_synced_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: 'organization_id,name,language' }
        );
    }

    // Purge local synthetic templates that are NOT present in Meta live catalog
    const { data: localRows } = await supabase
      .from('whatsapp_templates')
      .select('id, name, language')
      .eq('organization_id', orgId);

    const deletedLocalIds: string[] = [];
    if (localRows) {
      for (const row of localRows) {
        if (!liveKeys.has(`${row.name}:${row.language}`)) {
          await supabase.from('whatsapp_templates').delete().eq('id', row.id);
          deletedLocalIds.push(row.name);
        }
      }
    }

    return NextResponse.json({
      success: true,
      liveCount: liveTemplates.length,
      purgedCount: deletedLocalIds.length,
      purgedTemplates: deletedLocalIds,
      templates: liveTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        language: t.language,
        status: t.status,
        category: t.category,
        components: t.components,
      })),
    });
  }

  if (action === 'create') {
    const reqBody = await request.json().catch(() => ({}));
    const templateName = reqBody.name || 'flowsales_notification';
    const language = reqBody.language || 'tr';
    const category = reqBody.category || 'UTILITY';

    const createUrl = `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates`;
    const createPayload = {
      name: templateName,
      language: language,
      category: category,
      components: [
        {
          type: 'BODY',
          text: 'Sayin {{1}}, FlowSales AI uzerinden bildiriminiz var: {{2}}',
          example: {
            body_text: [['Cagatay', 'Siparis durumunuz guncellendi']],
          },
        },
      ],
    };

    const metaRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createPayload),
    });

    const metaJson = await metaRes.json();
    return NextResponse.json({
      httpStatus: metaRes.status,
      response: metaJson,
    });
  }

  if (action === 'send') {
    const reqBody = await request.json().catch(() => ({}));
    const templateName = reqBody.name || 'flowsales_notification';
    const languageCode = reqBody.language || 'tr';
    const bodyParameters = reqBody.bodyParameters || ['Cagatay', 'Siparis durumunuz guncellendi'];

    const service = new WhatsAppTemplateService();
    const result = await service.sendTemplateMessage({
      organizationId: orgId,
      userId,
      userRole: 'owner',
      conversationId,
      templateName,
      languageCode,
      bodyParameters,
      clientIdempotencyKey: `test_tpl_hardened_${Date.now()}`,
      isTestMode: true,
    });

    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
