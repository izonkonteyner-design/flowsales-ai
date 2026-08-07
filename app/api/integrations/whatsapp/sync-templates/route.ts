import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { decryptToken } from '@/server/services/integrations/encryption';

export const dynamic = 'force-dynamic';

const orgId = 'f11c1551-8b3a-4a18-ad6e-0ab16c061920';
const wabaId = '4238908486357701';

export async function POST(request: Request) {
  const reqSession = (request.headers.get('x-ingest-session') || '').trim();
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

  try {
    const accessToken = decryptToken(tokenRow.access_token_cipher);
    const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=100`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: 'Meta API error', details: json }, { status: 500 });
    }

    const nowIso = new Date().toISOString();
    const syncedTemplates: Array<{ name: string; language: string; status: string }> = [];

    if (Array.isArray(json.data)) {
      for (const tpl of json.data) {
        const { error: upsertErr } = await supabase
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

        if (!upsertErr) {
          syncedTemplates.push({ name: tpl.name, language: tpl.language, status: tpl.status });
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: syncedTemplates.length,
      templates: syncedTemplates,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 500 });
  }
}
