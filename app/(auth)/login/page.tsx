import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "Sign in",
  description: "Sign in to FlowSales AI.",
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
