"use client";

import * as React from "react";
import type {
  Collection,
  JourneyNode,
  LCard as LCardType,
  LType,
  Paginated,
} from "@linkedout/contracts/v2";

import { getUserCollections, getUserLs } from "@/lib/api";
import { InfiniteList } from "@/components/infinite-list";
import { EmptyState } from "@/components/empty-state";
import { LCard } from "@/components/l/l-card";
import { LCardSkeleton } from "@/components/l/l-card-skeleton";
import { JourneyTimeline } from "@/components/profile/journey-timeline";
import { CollectionCard } from "@/components/profile/collection-card";
import { CreateCollectionButton } from "@/components/collections/create-collection-button";
import { typeSectionLabel, useMeta } from "@/components/meta-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePrincipal } from "@/components/session-provider";
import { queryKeys } from "@/lib/query-keys";

const SECTION_TYPES: LType[] = [
  "L",
  "STORY",
  "BATTLE",
  "SCAR",
  "PLOT_TWIST",
  "CHECKPOINT",
  "LESSON",
  "WIN",
];

function LsList({ username, type, empty }: { username: string; type?: LType; empty: string }) {
  const principal = usePrincipal();
  return (
    <InfiniteList<LCardType>
      queryKey={queryKeys.users.ls(principal, username, type ?? "all")}
      queryFn={(cursor) => getUserLs(username, type, cursor)}
      getItemKey={(l) => l.id}
      renderItem={(l) => <LCard l={l} />}
      empty={<EmptyState description={empty} />}
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

function CollectionsList({
  username,
  empty,
  canCreate,
}: {
  username: string;
  empty: string;
  canCreate: boolean;
}) {
  const principal = usePrincipal();
  const queryKey = queryKeys.users.collections(principal, username);

  return (
    <div className="flex flex-col gap-3">
      {canCreate ? (
        <div className="flex justify-end">
          <CreateCollectionButton queryKey={queryKey} />
        </div>
      ) : null}
      <InfiniteList<Collection>
        queryKey={queryKey}
        queryFn={(cursor) => getUserCollections(username, cursor)}
        getItemKey={(c) => c.id}
        renderItem={(c) => <CollectionCard collection={c} />}
        empty={<EmptyState description={empty} />}
        skeleton={<Skeleton className="h-16 w-full" />}
        className="flex flex-col gap-3"
      />
    </div>
  );
}

export function ProfileTabs({
  username,
  journeyInitial,
  isSelf,
}: {
  username: string;
  journeyInitial?: Paginated<JourneyNode>;
  isSelf: boolean;
}) {
  const meta = useMeta();
  const [tab, setTab] = React.useState("journey");
  const emptyMsg = isSelf ? "Nothing here yet — share your first L." : "Nothing here yet.";

  return (
    <Tabs value={tab} onValueChange={setTab} className="mt-6">
      <div className="overflow-x-auto pb-1">
        <TabsList className="w-max">
          <TabsTrigger value="journey">Journey</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
          {SECTION_TYPES.map((t) => (
            <TabsTrigger key={t} value={t}>
              {typeSectionLabel(meta, t)}
            </TabsTrigger>
          ))}
          <TabsTrigger value="collections">Collections</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="journey" className="mt-6">
        <JourneyTimeline username={username} initial={journeyInitial} />
      </TabsContent>

      <TabsContent value="all" className="mt-6">
        <LsList username={username} empty={emptyMsg} />
      </TabsContent>

      {SECTION_TYPES.map((t) => (
        <TabsContent key={t} value={t} className="mt-6">
          <LsList username={username} type={t} empty={emptyMsg} />
        </TabsContent>
      ))}

      <TabsContent value="collections" className="mt-6">
        <CollectionsList
          username={username}
          canCreate={isSelf}
          empty={isSelf ? "No collections yet." : "No collections."}
        />
      </TabsContent>
    </Tabs>
  );
}
