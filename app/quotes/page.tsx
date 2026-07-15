import Sidebar from "../components/Sidebar";

export default function QuotesPage() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <main className="flex-1 p-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Quotes
        </h1>

        <p className="mt-2 text-slate-500">
          Create and manage customer quotes.
        </p>
      </main>
    </div>
  );
}