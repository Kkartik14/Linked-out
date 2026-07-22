import type { Metadata } from "next";

import { getFeedSidebar } from "@/lib/api";
import { getSession, requireViewer } from "@/lib/session";
import { FeedShell } from "@/components/feed/feed-shell";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user } = requireViewer(await getSession(), "/settings");
  // Ancillary rail data: the left rail loads independently and a failure must never block
  // editing or saving (it degrades to the static Search/Saved navigation).
  const sidebar = await getFeedSidebar().catch(() => undefined);

  return (
    <FeedShell sidebar={sidebar} railMode="left" labelledBy="settings-heading">
      <h1 id="settings-heading" className="mb-6 text-2xl font-semibold tracking-tight">
        Settings
      </h1>
      <SettingsForm user={user} />
    </FeedShell>
  );
}
