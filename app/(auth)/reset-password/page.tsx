import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "Reset password",
  description: "Set a new password for FlowSales AI.",
};

export default function ResetPasswordPage() {
  return <AuthForm mode="reset" />;
}
