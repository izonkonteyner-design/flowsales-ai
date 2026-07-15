import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 p-10">
      <h1 className="text-4xl font-bold">
        FlowSales AI
      </h1>

      <p className="text-slate-500 mt-2">
        Your AI Sales Employee
      </p>

      <Link href="/dashboard">
        <Button className="mt-8">
          Dashboard'a Git 🚀
        </Button>
      </Link>
    </main>
  );
}