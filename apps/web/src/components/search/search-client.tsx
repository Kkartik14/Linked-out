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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePrincipal } from "@/components/session-provider";
import { queryKeys } from "@/lib/query-keys";

/**
 * Public API search takes `q` and `type` only: L results are always relevance-ranked, and the
 * category filter chips are gone with the rest of the category concept.
 */
export function SearchClient({
  q,
  type,
  initialLs,
  initialUsers,
}: {
  q: string;
  type: "ls" | "users";
  initialLs?: Paginated<LCardType>;
  initialUsers?: Paginated<UserSummary>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const principal = usePrincipal();

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

      <Tabs
        value={type}
        onValueChange={(v) => navigate({ type: v === "ls" ? null : v })}
        className="mt-4"
      >
        <TabsList>
          <TabsTrigger value="ls">Ls</TabsTrigger>
          <TabsTrigger value="users">People</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-6">
        {!q ? (
          <EmptyState description="Search for a story, a lesson, or a person. Try “burnout”, “layoff”, or “first customer”." />
        ) : type === "users" ? (
          <InfiniteList<UserSummary>
            key={`users:${q}`}
            queryKey={queryKeys.search.users(principal, q)}
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
            key={`ls:${q}`}
            queryKey={queryKeys.search.ls(principal, q)}
            queryFn={(cursor) => searchLs(q, cursor)}
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
