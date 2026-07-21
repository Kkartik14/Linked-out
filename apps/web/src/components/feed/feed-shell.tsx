import * as React from "react";
import type { FeedSidebarResponse } from "@linkedout/contracts";

import { FeedSidebarLeft, FeedSidebarRight } from "@/components/feed/sidebar/feed-sidebar";

/** The stable desktop discovery frame shared by feed-like centre views. */
export function FeedShell({
  sidebar,
  labelledBy,
  children,
}: {
  sidebar?: FeedSidebarResponse;
  labelledBy: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-[80rem] grid-cols-1 items-start gap-6 px-4 py-6 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,42rem)_19rem]">
      <FeedSidebarLeft initial={sidebar} />
      <section aria-labelledby={labelledBy} className="min-w-0">
        {children}
      </section>
      <FeedSidebarRight initial={sidebar} />
    </div>
  );
}
