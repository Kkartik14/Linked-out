"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { FeedScope, FeedSort } from "@/lib/api";
import { useMeta } from "@/components/meta-provider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-visible:ring-ring/50 rounded-full border px-3 py-1 text-xs transition-colors outline-none focus-visible:ring-[3px]",
        active
          ? "bg-foreground text-background border-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function FeedControls({
  scope,
  sort,
  filter,
  canFollow,
}: {
  scope: FeedScope;
  sort: FeedSort;
  filter: string | null;
  canFollow: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const meta = useMeta();

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
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
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

      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={!filter} onClick={() => update({ filter: null })}>
          All
        </FilterChip>
        {meta.lCategory.map((c) => {
          const value = c.value.toLowerCase();
          return (
            <FilterChip
              key={c.value}
              active={filter === value}
              onClick={() => update({ filter: filter === value ? null : value })}
            >
              {c.label}
            </FilterChip>
          );
        })}
      </div>
    </div>
  );
}
