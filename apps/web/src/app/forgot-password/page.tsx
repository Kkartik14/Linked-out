import type { Metadata } from "next";

import { safeReturnTo } from "@/lib/auth-entry";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const sp = await searchParams;
  const returnTo = safeReturnTo(sp.returnTo);

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We’ll email you an 8-digit code to set a new one."
    >
      <ForgotPasswordForm returnTo={returnTo} />
    </AuthShell>
  );
}
