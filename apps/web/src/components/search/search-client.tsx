"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import type { LCard as LCardType, Paginated, UserSummary } from "@linkedout/contracts";

import { searchLs, searchUsers } from "@/lib/api";
import { InfiniteList } from "@/components/infinite-list";
import { LCard } from "@/components/l/l-card";
import { LCardSkeleton } from "@/components/l/l-card-skeleton";
import { UserSummaryCard } from "@/components/user-summary-card";
import { EmptyState } from "@/components/empty-state";
import { useMeta } from "@/components/meta-provider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function SearchClient({
  q,
  type,
  filter,
  initialLs,
  initialUsers,
}: {
  q: string;
  type: "ls" | "users";
  filter: string | null;
  initialLs?: Paginated<LCardType>;
  initialUsers?: Paginated<UserSummary>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const meta = useMeta();

  const [query, setQuery] = React.useState(q);

  function navigate(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const s = params.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ q: query.trim() || null });
        }}
        className="relative"
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="Search Ls, people…"
          aria-label="Search"
          className="border-input bg-muted/40 focus-visible:ring-ring/50 focus-visible:bg-background h-11 w-full rounded-lg border py-2 pr-3 pl-9 text-base outline-none focus-visible:ring-[3px]"
        />
      </form>

      <Tabs value={type} onValueChange={(v) => navigate({ type: v === "ls" ? null : v })} className="mt-4">
        <TabsList>
          <TabsTrigger value="ls">Ls</TabsTrigger>
          <TabsTrigger value="users">People</TabsTrigger>
        </TabsList>
      </Tabs>

      {type === "ls" ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <FilterChip active={!filter} onClick={() => navigate({ filter: null })}>
            All
          </FilterChip>
          {meta.lCategory.map((c) => {
            const value = c.value.toLowerCase();
            return (
              <FilterChip
                key={c.value}
                active={filter === value}
                onClick={() => navigate({ filter: filter === value ? null : value })}
              >
                {c.label}
              </FilterChip>
            );
          })}
        </div>
      ) : null}

      <div className="mt-6">
        {!q ? (
          <EmptyState description="Search for a story, a lesson, or a person. Try “burnout”, “layoff”, or “first customer”." />
        ) : type === "users" ? (
          <InfiniteList<UserSummary>
            key={`users:${q}`}
            queryKey={["search", "users", q]}
            queryFn={(cursor) => searchUsers(q, cursor)}
            initial={initialUsers}
            getItemKey={(u) => u.id}
            renderItem={(u) => <UserSummaryCard user={u} />}
            empty={<EmptyState description={`No people found for “${q}”.`} />}
            skeleton={<p className="text-muted-foreground text-sm">Searching…</p>}
            className="flex flex-col gap-2"
          />
        ) : (
          <InfiniteList<LCardType>
            key={`ls:${q}:${filter ?? "all"}`}
            queryKey={["search", "ls", q, filter]}
            queryFn={(cursor) => searchLs(q, filter ?? undefined, cursor)}
            initial={initialLs}
            getItemKey={(l) => l.id}
            renderItem={(l) => <LCard l={l} />}
            empty={<EmptyState description={`No Ls found for “${q}”.`} />}
            skeleton={
              <>
                <LCardSkeleton />
                <LCardSkeleton />
              </>
            }
            className="flex flex-col gap-4"
          />
        )}
      </div>
    </div>
  );
}

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
