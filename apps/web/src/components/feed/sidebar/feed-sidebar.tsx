"use client";

import { useQuery } from "@tanstack/react-query";
import type { FeedSidebarResponse } from "@linkedout/contracts";

import { getFeedSidebar } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { usePrincipal } from "@/components/session-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ViewerCard } from "@/components/feed/sidebar/viewer-card";
import { PeopleToFollow } from "@/components/feed/sidebar/people-to-follow";
import { TopLs } from "@/components/feed/sidebar/top-ls";
import { LOfTheDay } from "@/components/feed/sidebar/l-of-the-day";
import { SidebarNavigation } from "@/components/feed/sidebar/sidebar-navigation";

/**
 * The feed's discovery rails, from one optional-auth aggregate (public contract §2).
 *
 * Both rails read the same principal-scoped query, so the two components below share a
 * single request rather than fetching twice. They are separate exports because they are
 * separate grid children — the wire deliberately does not encode left/right, so placement
 * is decided by the page.
 */
function useFeedSidebar(initial: FeedSidebarResponse | undefined) {
  const principal = usePrincipal();

  return useQuery({
    queryKey: queryKeys.feedSidebar.detail(principal),
    queryFn: getFeedSidebar,
    ...(initial
      ? {
          initialData: initial,
          // The server fetched this at `generatedAt`, not now — date the cache entry from
          // the response so its freshness is measured from when it was actually composed.
          initialDataUpdatedAt: () => Date.parse(initial.generatedAt),
        }
      : {}),
    // `refreshAfter` is the backend's own freshness hint, so derive the window from the
    // response instead of restating its 60s here. Deliberately not a poll: refetching
    // reshuffles both rails, so they refresh on remount and after a follow, and never
    // under a reader's eyes.
    staleTime: (query) => {
      const data = query.state.data;
      if (!data) return 0;
      return Math.max(0, Date.parse(data.refreshAfter) - Date.parse(data.generatedAt));
    },
  });
}

/**
 * Deliberately carries no base `display` utility.
 *
 * `cn` is tailwind-merge, so a `flex` here would silently cancel the `hidden` each rail
 * composes it with — they occupy the same conflict slot, and the later one wins. Each rail
 * owns its display entirely (`hidden` → `lg:flex` / `xl:flex`), so nothing collides.
 */
const RAIL = "flex-col gap-3 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto";

/** `label` is per rail: only the left one is suggestions, and a screen reader is told
 * what is actually arriving rather than what the other rail happens to hold. */
function RailSkeleton({ blocks, label }: { blocks: number[]; label: string }) {
  return (
    <div aria-busy className="flex flex-col gap-3">
      {blocks.map((height, index) => (
        <Skeleton key={index} className="rounded-xl" style={{ height }} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function FeedSidebarLeft({ initial }: { initial?: FeedSidebarResponse }) {
  const { data, isError } = useFeedSidebar(initial);

  return (
    <aside aria-label="Profile and discovery" className={cn("hidden lg:flex", RAIL)}>
      {data ? (
        <>
          <ViewerCard viewer={data.viewer} />
          <SidebarNavigation />
          <PeopleToFollow items={data.peopleToFollow.items} viewer={data.viewer} />
        </>
      ) : isError ? (
        <SidebarNavigation />
      ) : (
        <>
          <RailSkeleton blocks={[210]} label="Loading your profile…" />
          <SidebarNavigation />
          <RailSkeleton blocks={[260]} label="Loading suggested builders…" />
        </>
      )}
    </aside>
  );
}

export function FeedSidebarRight({ initial }: { initial?: FeedSidebarResponse }) {
  const { data, isError } = useFeedSidebar(initial);

  if (isError && !data) return null;

  return (
    <aside aria-label="Top Ls and L of the day" className={cn("hidden xl:flex", RAIL)}>
      {data ? (
        <>
          <TopLs items={data.topLs.items} windowLabel={data.topLs.windowLabel} />
          <LOfTheDay daily={data.lOfTheDay} />
        </>
      ) : (
        <RailSkeleton blocks={[280, 190]} label="Loading top Ls and L of the day…" />
      )}
    </aside>
  );
}
