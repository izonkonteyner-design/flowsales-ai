import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "Sign up",
  description: "Create your FlowSales AI workspace.",
};

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
