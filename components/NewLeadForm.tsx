"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";

export default function NewLeadForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [source, setSource] = useState("WhatsApp");
  const [status, setStatus] = useState("New");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);
    setMessage("");

    const { error } = await supabase.from("leads").insert({
      name,
      company: company || null,
      source,
      status,
      value: value || null,
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
      setIsSaving(false);
      return;
    }

    setName("");
    setCompany("");
    setSource("WhatsApp");
    setStatus("New");
    setValue("");
    setMessage("Lead added successfully.");

    router.refresh();
    setIsSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900">New Lead</h2>

        <p className="mt-1 text-sm text-slate-500">
          Capture a new prospect for your pipeline.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-700">
            Full name
          </label>

          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
            placeholder="Ahmet Yilmaz"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Company
          </label>

          <input
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
            placeholder="Yilmaz Yapi"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Source
          </label>

          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
          >
            <option>WhatsApp</option>
            <option>Instagram</option>
            <option>Website</option>
            <option>Referral</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Status</label>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
          >
            <option>New</option>
            <option>Contacted</option>
            <option>Quote Sent</option>
            <option>Negotiation</option>
            <option>Won</option>
            <option>Lost</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-medium text-slate-700">
            Estimated value
          </label>

          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
            placeholder="₺850,000"
          />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Lead"}
        </button>

        {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      </div>
    </form>
  );
}
