import { Clock3, Search, ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import { listAuditLogs } from "@/server/services/productivity";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AuditLogsPage({ searchParams }: Props) {
  const params = await searchParams;
  const action = typeof params.action === "string" ? params.action.trim() : "";
  const entity = typeof params.entity === "string" ? params.entity.trim() : "";
  const logs = await listAuditLogs({ action: action || undefined, entity: entity || undefined });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Güvenlik" title="Denetim Kayıtları" description="Görev, takvim, API anahtarı ve diğer güvenli sunucu işlemlerini çalışma alanı kapsamında izleyin." actions={<ShieldAlert className="h-5 w-5 text-violet-300" />} />
      <SectionCard title="Filtreler" description="İşlem adı ve varlık türüne göre denetim izini daraltın.">
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input name="action" defaultValue={action} placeholder="İşlem ara: task, api_key..." />
          <Input name="entity" defaultValue={entity} placeholder="Varlık türü: task, calendar_event..." />
          <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950"><Search className="h-4 w-4" /> Filtrele</button>
        </form>
      </SectionCard>
      <SectionCard title={`Kayıtlar · ${logs.length}`} description="En yeni kayıtlar önce gösterilir.">
        {logs.length === 0 ? <EmptyState title="Kayıt bulunamadı" description="Seçili filtrelerle eşleşen bir denetim kaydı yok." /> : <div className="space-y-3">{logs.map((log) => <div key={log.id} className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-medium text-white">{log.action}</p><p className="mt-1 text-sm text-slate-500">{log.entity_type}{log.entity_id ? ` · ${log.entity_id}` : ""}</p></div><div className="flex items-center gap-2 text-sm text-slate-500"><Clock3 className="h-4 w-4" />{formatDateTime(log.created_at)}</div></div>)}</div>}
      </SectionCard>
    </div>
  );
}
