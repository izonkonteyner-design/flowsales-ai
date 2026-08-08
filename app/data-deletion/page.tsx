import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion | FlowSales AI",
  description: "Instructions for requesting deletion of data associated with FlowSales AI integrations.",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">FlowSales AI</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Data deletion instructions</h1>
        <p className="mt-5 text-base leading-7 text-slate-300">
          You can request deletion of personal data associated with your FlowSales AI account or a connected Meta account at any time.
        </p>

        <section className="mt-10 space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-semibold text-white">How to request deletion</h2>
          <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-300">
            <li>Disconnect the relevant Facebook or Instagram integration from FlowSales AI, when available.</li>
            <li>
              Send a deletion request to <a className="font-medium text-violet-300 underline" href="mailto:izonkonteyner@gmail.com">izonkonteyner@gmail.com</a> from the email address associated with your FlowSales AI account.
            </li>
            <li>Include the subject line <strong className="text-white">FlowSales AI Data Deletion Request</strong> and identify the workspace and connected Meta account you want removed.</li>
          </ol>
        </section>

        <section className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-semibold text-white">What will be deleted</h2>
          <p className="text-sm leading-6 text-slate-300">
            After we verify the request, we will delete or anonymize personal data and stored integration credentials associated with the requested account where deletion is permitted. Data that must be retained for legal, security, fraud-prevention, or accounting obligations may be retained only for the required period.
          </p>
        </section>

        <section className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-semibold text-white">Meta account removal</h2>
          <p className="text-sm leading-6 text-slate-300">
            Removing FlowSales AI from your Facebook or Instagram connected apps stops future access through that authorization. If you also want previously stored FlowSales AI data removed, submit the deletion request described above.
          </p>
        </section>

        <p className="mt-8 text-xs leading-5 text-slate-500">
          For privacy information, visit <a className="underline hover:text-slate-300" href="/privacy">FlowSales AI Privacy Policy</a>.
        </p>
      </div>
    </main>
  );
}
