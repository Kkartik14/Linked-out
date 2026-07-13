"use client";

import type { LCard as LCardType } from "@linkedout/contracts";

import { getSaved } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { usePrincipal } from "@/components/session-provider";
import { InfiniteList } from "@/components/infinite-list";
import { LCard } from "@/components/l/l-card";
import { LCardSkeleton } from "@/components/l/l-card-skeleton";
import { EmptyState } from "@/components/empty-state";

export function SavedList() {
  const principal = usePrincipal();

  return (
    <InfiniteList<LCardType>
      queryKey={queryKeys.saved.all(principal)}
      queryFn={(cursor) => getSaved(cursor)}
      getItemKey={(l) => l.id}
      renderItem={(l) => <LCard l={l} />}
      empty={
        <EmptyState description="Nothing saved yet. Tap the bookmark on any L to keep it here." />
      }
      skeleton={
        <>
          <LCardSkeleton />
          <LCardSkeleton />
        </>
      }
      className="flex flex-col gap-4"
    />
  );
}
