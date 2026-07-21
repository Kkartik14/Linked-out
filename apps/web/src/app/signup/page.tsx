import type { Metadata } from "next";

import { safeReturnTo } from "@/lib/auth-entry";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const sp = await searchParams;
  const returnTo = safeReturnTo(sp.returnTo);

  return (
    <AuthShell
      title="Create your account"
      subtitle="Share the Ls that shaped you — the rejections, pivots, and lessons."
    >
      <SignupForm returnTo={returnTo} />
    </AuthShell>
  );
}
