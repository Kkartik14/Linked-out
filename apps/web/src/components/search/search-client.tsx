"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
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

const DEBOUNCE_MS = 180;

/** A live search centre; the URL mirrors settled state without remounting the page per keypress. */
export function SearchClient({
  q,
  type,
  initialLs,
  initialUsers,
  emptyContent,
  focusInput = false,
}: {
  q: string;
  type: "ls" | "users";
  initialLs?: Paginated<LCardType>;
  initialUsers?: Paginated<UserSummary>;
  emptyContent: React.ReactNode;
  focusInput?: boolean;
}) {
  const pathname = usePathname();
  const principal = usePrincipal();
  const [rawQuery, setRawQuery] = React.useState(q);
  const [debouncedQuery, setDebouncedQuery] = React.useState(q);
  const [activeType, setActiveType] = React.useState(type);
  const query = rawQuery.trim();

  React.useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedQuery(query),
      query ? DEBOUNCE_MS : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [query]);

  React.useEffect(() => {
    const syncFromHistory = () => {
      const params = new URLSearchParams(window.location.search);
      const nextQuery = (params.get("q") ?? "").trim();
      setRawQuery(nextQuery);
      setDebouncedQuery(nextQuery);
      setActiveType(params.get("type") === "users" ? "users" : "ls");
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (debouncedQuery) {
      params.set("q", debouncedQuery);
      if (activeType === "users") params.set("type", "users");
      else params.delete("type");
    } else {
      params.delete("q");
      params.delete("type");
    }
    const next = params.toString();
    window.history.replaceState(null, "", next ? `${pathname}?${next}` : pathname);
  }, [activeType, debouncedQuery, pathname]);

  const settled = query === debouncedQuery;
  const useServerLs = settled && debouncedQuery === q && activeType === type;
  const useServerUsers = settled && debouncedQuery === q && activeType === type;

  return (
    <div>
      <div className="mb-5">
        <h1 id="search-heading" className="text-2xl font-semibold tracking-tight">
          Search
        </h1>
        <p className="text-muted-foreground text-sm">Find Ls and builders across LinkedOut.</p>
      </div>

      <form
        role="search"
        aria-label="Full search"
        onSubmit={(event) => {
          event.preventDefault();
          setDebouncedQuery(query);
        }}
        className="relative"
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          type="search"
          value={rawQuery}
          maxLength={100}
          onChange={(event) => setRawQuery(event.target.value)}
          autoFocus={focusInput}
          placeholder="Search Ls, people…"
          aria-label="Search Ls and people"
          className="border-input bg-muted/40 focus-visible:ring-ring/50 focus-visible:bg-background h-11 w-full rounded-lg border py-2 pr-3 pl-9 text-base outline-none focus-visible:ring-[3px]"
        />
      </form>

      {!query ? (
        <div className="mt-8">{emptyContent}</div>
      ) : (
        <>
          <Tabs
            value={activeType}
            onValueChange={(value) => setActiveType(value === "users" ? "users" : "ls")}
            className="mt-4"
          >
            <TabsList>
              <TabsTrigger value="ls">Ls</TabsTrigger>
              <TabsTrigger value="users">People</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="mt-6">
            {!settled ? (
              activeType === "ls" ? (
                <div aria-busy className="flex flex-col gap-4">
                  <LCardSkeleton />
                  <span className="sr-only">Searching Ls…</span>
                </div>
              ) : (
                <p aria-busy className="text-muted-foreground text-sm">
                  Searching people…
                </p>
              )
            ) : activeType === "users" ? (
              <InfiniteList<UserSummary>
                key={`users:${debouncedQuery}`}
                queryKey={queryKeys.search.infinite.users(principal, debouncedQuery)}
                queryFn={(cursor, signal) =>
                  searchUsers(debouncedQuery, cursor, undefined, { signal })
                }
                initial={useServerUsers ? initialUsers : undefined}
                getItemKey={(user) => user.id}
                renderItem={(user) => <UserSummaryCard user={user} />}
                empty={<EmptyState description={`No people found for “${debouncedQuery}”.`} />}
                skeleton={<p className="text-muted-foreground text-sm">Searching…</p>}
                loadingLabel="Searching people…"
                className="flex flex-col gap-2"
              />
            ) : (
              <InfiniteList<LCardType>
                key={`ls:${debouncedQuery}`}
                queryKey={queryKeys.search.infinite.ls(principal, debouncedQuery)}
                queryFn={(cursor, signal) =>
                  searchLs(debouncedQuery, cursor, undefined, { signal })
                }
                initial={useServerLs ? initialLs : undefined}
                getItemKey={(l) => l.id}
                renderItem={(l) => <LCard l={l} />}
                empty={<EmptyState description={`No Ls found for “${debouncedQuery}”.`} />}
                skeleton={
                  <>
                    <LCardSkeleton />
                    <LCardSkeleton />
                  </>
                }
                loadingLabel="Searching Ls…"
                className="flex flex-col gap-4"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
