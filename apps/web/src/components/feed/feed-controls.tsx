"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { FeedScope, FeedSort } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Scope and sort for the feed. v2 removed the category concept, so the filter chips that
 * used to sit under these tabs are gone and sort is the only ranking axis left.
 */
export function FeedControls({
  scope,
  sort,
  // Deliberately not `canFollow`: that name belongs to `SuggestedUser.viewer.canFollow`
  // (contract v2 §2) — a per-user permission the backend owns and §2 says not to recreate.
  // This is only "is there a Following tab to offer", which is a session fact.
  canUseFollowingFeed,
}: {
  scope: FeedScope;
  sort: FeedSort;
  canUseFollowingFeed: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    // Logged out there is no scope switch, so sort sits at the start rather than floating
    // alone against the right edge.
    <div
      className={cn(
        "mb-5 flex flex-wrap items-center gap-2",
        canUseFollowingFeed && "justify-between",
      )}
    >
      {canUseFollowingFeed ? (
        <Tabs value={scope} onValueChange={(v) => update({ scope: v === "global" ? null : v })}>
          <TabsList>
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="following">Following</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      <Tabs value={sort} onValueChange={(v) => update({ sort: v === "latest" ? null : v })}>
        <TabsList>
          <TabsTrigger value="latest">Latest</TabsTrigger>
          <TabsTrigger value="popular">Most Popular</TabsTrigger>
          <TabsTrigger value="helpful">Most Helpful</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
