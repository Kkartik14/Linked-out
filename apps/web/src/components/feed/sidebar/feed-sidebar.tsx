"use client";

import { useQuery } from "@tanstack/react-query";
import type { FeedSidebarResponse } from "@linkedout/contracts/v2";

import { getFeedSidebar } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { usePrincipal } from "@/components/session-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ViewerCard } from "@/components/feed/sidebar/viewer-card";
import { PeopleToFollow } from "@/components/feed/sidebar/people-to-follow";
import { TopLs } from "@/components/feed/sidebar/top-ls";
import { LOfTheDay } from "@/components/feed/sidebar/l-of-the-day";

/**
 * The feed's discovery rails, from one optional-auth aggregate (contract v2 §2).
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

const RAIL = "flex flex-col gap-3 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto";

function RailSkeleton({ blocks }: { blocks: number[] }) {
  return (
    <div aria-busy className="flex flex-col gap-3">
      {blocks.map((height, index) => (
        <Skeleton key={index} className="rounded-xl" style={{ height }} />
      ))}
      <span className="sr-only">Loading suggestions…</span>
    </div>
  );
}

export function FeedSidebarLeft({ initial }: { initial?: FeedSidebarResponse }) {
  const { data, isError } = useFeedSidebar(initial);

  // This request fails independently of the centre feed: hide the rail, keep the page.
  if (isError && !data) return null;

  return (
    <aside aria-label="Your profile and suggested builders" className={cn("hidden lg:block", RAIL)}>
      {data ? (
        <>
          <ViewerCard viewer={data.viewer} />
          <PeopleToFollow items={data.peopleToFollow.items} />
        </>
      ) : (
        <RailSkeleton blocks={[210, 260]} />
      )}
    </aside>
  );
}

export function FeedSidebarRight({ initial }: { initial?: FeedSidebarResponse }) {
  const { data, isError } = useFeedSidebar(initial);

  if (isError && !data) return null;

  return (
    <aside aria-label="Top Ls and L of the day" className={cn("hidden xl:block", RAIL)}>
      {data ? (
        <>
          <TopLs items={data.topLs.items} window={data.topLs.window} />
          <LOfTheDay daily={data.lOfTheDay} />
        </>
      ) : (
        <RailSkeleton blocks={[280, 190]} />
      )}
    </aside>
  );
}
