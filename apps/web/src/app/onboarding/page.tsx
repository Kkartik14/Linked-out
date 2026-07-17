import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession, requireViewer } from "@/lib/session";
import { safeReturnTo } from "@/lib/auth-entry";
import { OnboardingForm } from "@/components/onboarding-form";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const sp = await searchParams;
  const { user, needsOnboarding } = requireViewer(await getSession(), "/onboarding");
  // The backend decides who still needs onboarding; without this an already-onboarded user
  // who navigates here is handed the setup form and invited to re-pick a username.
  if (!needsOnboarding) redirect(safeReturnTo(sp.returnTo));

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your profile</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Pick a username so builders can find your journey.
      </p>
      <OnboardingForm returnTo={safeReturnTo(sp.returnTo)} defaultName={user.name ?? ""} />
    </div>
  );
}
