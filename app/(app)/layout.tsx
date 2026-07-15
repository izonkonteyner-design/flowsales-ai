import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <Navbar />

        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
