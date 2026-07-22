import type { Metadata } from "next";

import { getFeedSidebar } from "@/lib/api";
import { getSession, requireViewer } from "@/lib/session";
import { SavedList } from "@/components/saved-list";
import { FeedShell } from "@/components/feed/feed-shell";

export const metadata: Metadata = { title: "Saved" };

export default async function SavedPage() {
  requireViewer(await getSession(), "/saved");
  // Discovery is ancillary to the saved list. Authorize first, then let rail failure degrade
  // independently so a transient ranking/sidebar problem never blocks a person's bookmarks.
  const sidebar = await getFeedSidebar().catch(() => undefined);

  return (
    <FeedShell sidebar={sidebar} labelledBy="saved-heading">
      <div className="w-full max-w-2xl">
        <h1 id="saved-heading" className="mb-5 text-2xl font-semibold tracking-tight">
          Saved
        </h1>
        <SavedList />
      </div>
    </FeedShell>
  );
}
