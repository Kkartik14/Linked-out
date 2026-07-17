import type { Metadata } from "next";

import { getSession, requireViewer } from "@/lib/session";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user } = requireViewer(await getSession(), "/settings");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsForm user={user} />
    </div>
  );
}
