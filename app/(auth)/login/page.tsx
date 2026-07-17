import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "Sign in",
  description: "Sign in to FlowSales AI.",
};

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  return <AuthForm mode="login" next={params.next ?? "/dashboard"} />;
}
