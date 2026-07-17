import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "Reset password",
  description: "Set a new password for FlowSales AI.",
};

type ResetPasswordPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = (await searchParams) ?? {};
  return <AuthForm mode="reset" next={params.next ?? "/dashboard"} />;
}
