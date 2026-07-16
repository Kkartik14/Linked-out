"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { FeedScope, FeedSort } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Scope and sort for the feed. v2 removed the category concept, so the filter chips that
 * used to sit under these tabs are gone and sort is the only ranking axis left.
 */
export function FeedControls({
  scope,
  sort,
  canFollow,
}: {
  scope: FeedScope;
  sort: FeedSort;
  canFollow: boolean;
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
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
      {canFollow ? (
        <Tabs value={scope} onValueChange={(v) => update({ scope: v === "global" ? null : v })}>
          <TabsList>
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="following">Following</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : (
        <span />
      )}
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
