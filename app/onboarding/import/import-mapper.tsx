"use client";

import { useMemo, useState } from "react";

import { importLeadsAction } from "./actions";

const targets = [
  ["full_name", "Full name *"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["company", "Company"],
  ["source", "Source"],
  ["status", "Status"],
] as const;

const aliasMap: Record<string, string[]> = {
  full_name: ["full_name", "full name", "name", "ad soyad", "ad_soyad", "isim", "müşteri", "musteri"],
  email: ["email", "e-mail", "mail", "eposta", "e-posta"],
  phone: ["phone", "telephone", "tel", "telefon", "gsm", "mobile"],
  company: ["company", "company name", "firma", "şirket", "sirket", "kurum"],
  source: ["source", "lead source", "kaynak", "kanal"],
  status: ["status", "lead status", "durum", "aşama", "asama"],
};

function parseHeaders(csv: string) {
  const firstLine = csv.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const headers: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < firstLine.length; i += 1) {
    const char = firstLine[i];
    if (char === '"') {
      if (quoted && firstLine[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      headers.push(current.trim());
      current = "";
    } else current += char;
  }
  headers.push(current.trim());
  return headers.filter(Boolean);
}

function suggest(headers: string[]) {
  return Object.fromEntries(
    targets.flatMap(([field]) => {
      const found = headers.find((header) => aliasMap[field].includes(header.toLocaleLowerCase("tr-TR")));
      return found ? [[field, found]] : [];
    }),
  ) as Record<string, string>;
}

export function ImportMapper({ organizationId }: { organizationId: string }) {
  const [csv, setCsv] = useState("");
  const headers = useMemo(() => parseHeaders(csv), [csv]);
  const suggestions = useMemo(() => suggest(headers), [headers]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const mapping = Object.fromEntries(targets.map(([field]) => [field, overrides[field] ?? suggestions[field] ?? ""]));
  const fullNameMapped = Boolean(mapping.full_name);
  const duplicate = Object.values(mapping).filter(Boolean).some((value, index, all) => all.indexOf(value) !== index);

  return (
    <form action={importLeadsAction} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />
      <div>
        <label className="block text-sm font-semibold text-slate-800" htmlFor="csv">1. Paste CSV content</label>
        <textarea id="csv" name="csv" required rows={12} value={csv} onChange={(event) => setCsv(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-mono text-sm" placeholder={'Ad Soyad,E-posta,Firma\nJane Doe,jane@example.com,Acme'} />
      </div>

      {headers.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-slate-800">2. Match your columns</h2>
          <p className="mt-1 text-sm text-slate-500">We suggested matches from your header row. Change any incorrect match.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {targets.map(([field, label]) => (
              <label key={field} className="text-sm font-medium text-slate-700">
                {label}
                <select value={mapping[field]} onChange={(event) => setOverrides((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="">Do not import</option>
                  {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {!fullNameMapped && headers.length > 0 ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Choose the column containing the lead&apos;s full name.</p> : null}
      {duplicate ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Each CSV column can only be used once.</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!fullNameMapped || duplicate} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">3. Validate and import</button>
        <span className="text-xs text-slate-500">Maximum 5,000 rows. Invalid rows are skipped and included in a downloadable report.</span>
      </div>
    </form>
  );
}
