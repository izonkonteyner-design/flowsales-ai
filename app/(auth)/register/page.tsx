import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "Register",
  description: "Create your FlowSales AI account.",
};

type RegisterPageProps = {
  searchParams?: Promise<{
    bootstrap?: string;
    next?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = (await searchParams) ?? {};
  const bootstrap = params.bootstrap === "1";
  return <AuthForm mode={bootstrap ? "bootstrap" : "register"} next={params.next ?? "/dashboard"} />;
}
