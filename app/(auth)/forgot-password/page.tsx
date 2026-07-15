import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "Forgot password",
  description: "Recover your FlowSales AI account.",
};

export default function ForgotPasswordPage() {
  return <AuthForm mode="forgot" />;
}
