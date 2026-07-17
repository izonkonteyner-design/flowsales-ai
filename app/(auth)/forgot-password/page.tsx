import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "Forgot password",
  description: "Recover your FlowSales AI account.",
};

type ForgotPasswordPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = (await searchParams) ?? {};
  return <AuthForm mode="forgot" next={params.next ?? "/login"} />;
}
