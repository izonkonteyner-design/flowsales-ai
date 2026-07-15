import Sidebar from "../components/Sidebar";

export default function AIPage() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <main className="flex-1 p-8">
        <h1 className="text-3xl font-bold text-slate-900">
          AI Assistant
        </h1>

        <p className="mt-2 text-slate-500">
          Train and manage your AI sales employee.
        </p>
      </main>
    </div>
  );
}