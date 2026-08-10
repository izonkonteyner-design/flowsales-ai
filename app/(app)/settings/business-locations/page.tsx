import Link from "next/link";
import { MapPin, Phone, Clock, Trash2 } from "lucide-react";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { listBusinessLocations } from "@/server/services/business-locations";
import { saveBusinessLocationAction, deleteBusinessLocationAction } from "./actions";

type Props = { searchParams: Promise<Record<string,string|string[]|undefined>> };

export default async function BusinessLocationsPage({ searchParams }: Props) {
  const [workspace, params] = await Promise.all([getWorkspaceContext(), searchParams]);
  const isDemo = workspace.mode === "demo";
  const canManage = !isDemo && (workspace.role === "owner" || workspace.role === "admin");
  const locations = isDemo ? [] : await listBusinessLocations(workspace.organization.id).catch(() => []);
  const toast = typeof params.toast === "string" ? params.toast : "";
  const danger = params.tone === "danger";

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-semibold text-blue-600">AI Telefon Satış Kanalı</p><h1 className="text-3xl font-bold text-slate-950 dark:text-white">İşletme Konumları</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">AI yalnızca burada kayıtlı aktif konumları showroom/adres gerçeği olarak kullanır. Prompt içine sabit adres yazılmaz.</p></div>
      <Link href="/settings/integrations" className="rounded-xl border px-4 py-2 text-sm font-medium">Entegrasyonlara dön</Link>
    </div>
    {toast ? <div className={`rounded-2xl border p-4 text-sm ${danger ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{toast}</div> : null}

    <div className="grid gap-4 lg:grid-cols-2">
      {locations.map((location) => <article key={location.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-950 dark:text-white">{location.name}</h2><p className="mt-1 flex items-start gap-2 text-sm text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{location.address}, {location.district ? `${location.district}, ` : ""}{location.city}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${location.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{location.active ? "Aktif" : "Pasif"}</span></div>
        {location.phone ? <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Phone className="h-4 w-4" />{location.phone}</p> : null}
        {location.visitingHours ? <p className="mt-2 flex items-center gap-2 text-sm text-slate-500"><Clock className="h-4 w-4" />{location.visitingHours}</p> : null}
        <p className="mt-3 text-xs text-slate-400">Randevu: {location.appointmentRequired ? "Gerekli" : "Gerekli değil"}</p>
        {canManage ? <form action={deleteBusinessLocationAction} className="mt-4"><input type="hidden" name="id" value={location.id}/><button className="inline-flex items-center gap-2 text-xs font-medium text-rose-600"><Trash2 className="h-4 w-4"/>Sil</button></form> : null}
      </article>)}
      {!locations.length ? <div className="rounded-3xl border border-dashed p-8 text-sm text-slate-500">Henüz doğrulanmış işletme konumu yok. AI showroom adresi söylemek yerine insan desteğine yönlendirecek.</div> : null}
    </div>

    {canManage ? <form action={saveBusinessLocationAction} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
      <h2 className="text-lg font-semibold">Yeni konum ekle</h2><p className="mt-1 text-sm text-slate-500">Torbalı showroom dahil tüm konumların tek doğruluk kaynağı.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm">Ad<input name="name" required className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2" placeholder="İZON Konteyner Torbalı Showroom"/></label>
        <label className="text-sm">Tür<select name="locationType" className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"><option value="showroom">Showroom</option><option value="office">Ofis</option><option value="factory">Fabrika</option><option value="other">Diğer</option></select></label>
        <label className="text-sm md:col-span-2">Adres<input name="address" required className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"/></label>
        <label className="text-sm">İlçe<input name="district" className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2" placeholder="Torbalı"/></label>
        <label className="text-sm">Şehir<input name="city" required className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2" placeholder="İzmir"/></label>
        <label className="text-sm">Telefon<input name="phone" className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"/></label>
        <label className="text-sm">Çalışma saatleri<input name="workingHours" className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2" placeholder="Pzt-Cmt 09:00-18:00"/></label>
        <label className="text-sm md:col-span-2">Google Maps URL<input name="mapsUrl" type="url" className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"/></label>
        <label className="text-sm">Enlem<input name="latitude" type="number" step="0.0000001" className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"/></label>
        <label className="text-sm">Boylam<input name="longitude" type="number" step="0.0000001" className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"/></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-5 text-sm"><label><input type="checkbox" name="appointmentRequired" className="mr-2"/>Randevu gerekli</label><label><input type="checkbox" name="active" defaultChecked className="mr-2"/>Aktif</label></div>
      <button className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">Konumu kaydet</button>
    </form> : <div className="rounded-2xl border p-4 text-sm text-slate-500">Konum yönetimi yalnızca Owner/Admin rollerine açıktır.</div>}
  </div>;
}
