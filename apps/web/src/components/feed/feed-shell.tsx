import * as React from "react";
import type { FeedSidebarResponse } from "@linkedout/contracts";

import { FeedSidebarLeft, FeedSidebarRight } from "@/components/feed/sidebar/feed-sidebar";
import { cn } from "@/lib/utils";

/** The stable desktop discovery frame shared by feed-like centre views. */
export function FeedShell({
  sidebar,
  labelledBy,
  railMode = "both",
  children,
}: {
  sidebar?: FeedSidebarResponse;
  labelledBy: string;
  /**
   * `both` (default) is the feed/search frame: left rail, centre, right rail.
   * `left` never mounts the right rail and caps the centre so a single-column page like
   * Settings keeps a consistent width from `lg` up instead of sprawling at `xl`.
   */
  railMode?: "both" | "left";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto grid w-full max-w-[80rem] grid-cols-1 items-start gap-6 px-4 py-6",
        railMode === "left"
          ? "lg:grid-cols-[17rem_minmax(0,42rem)]"
          : "lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,42rem)_19rem]",
      )}
    >
      <FeedSidebarLeft initial={sidebar} />
      <section aria-labelledby={labelledBy} className="min-w-0">
        {children}
      </section>
      {railMode === "both" ? <FeedSidebarRight initial={sidebar} /> : null}
    </div>
  );
}
