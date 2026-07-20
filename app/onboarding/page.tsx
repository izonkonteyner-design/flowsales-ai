import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { OnboardingForm } from "./onboarding-form";

export const metadata = {
  title: "Welcome to FlowSales AI",
};

export default async function OnboardingPage() {
  const workspace = await getWorkspaceContext();

  if (workspace.mode !== "live") {
    redirect("/dashboard");
  }

  if (workspace.role !== "owner") {
    redirect("/dashboard");
  }

  if (workspace.organization.onboarding_completed_at !== null) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Welcome to FlowSales AI!
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Let&apos;s set up your workspace. You can skip the optional steps and do them later.
          </p>
        </div>
        
        <OnboardingForm organization={workspace.organization} />
      </div>
    </div>
  );
}
