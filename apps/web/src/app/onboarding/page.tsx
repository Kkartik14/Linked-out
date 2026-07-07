import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSafeReturnTo } from "@linkedout/contracts";

import { getSession } from "@/lib/session";
import { OnboardingForm } from "@/components/onboarding-form";

export const metadata: Metadata = { title: "Set up your profile" };

function safeReturnTo(value: string | undefined): string {
  return value && isSafeReturnTo(value) ? value : "/";
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session.user) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your profile</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Pick a username so builders can find your journey.
      </p>
      <OnboardingForm returnTo={safeReturnTo(sp.returnTo)} defaultName={session.user.name ?? ""} />
    </div>
  );
}
