"use client";

import * as React from "react";
import {
  lTypeSchema,
  LCard as LCardType,
  LType,
} from "@linkedout/contracts";

import { getUserLs } from "@/lib/api";
import { InfiniteList } from "@/components/infinite-list";
import { EmptyState } from "@/components/empty-state";
import { LCard } from "@/components/l/l-card";
import { LCardSkeleton } from "@/components/l/l-card-skeleton";
import { typeSectionLabel, useMeta } from "@/components/meta-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePrincipal } from "@/components/session-provider";
import { queryKeys } from "@/lib/query-keys";

function LsList({ username, type, empty }: { username: string; type: LType; empty: string }) {
  const principal = usePrincipal();
  return (
    <InfiniteList<LCardType>
      queryKey={queryKeys.users.ls(principal, username, type)}
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

export function ProfileTabs({
  username,
  isSelf,
}: {
  username: string;
  isSelf: boolean;
}) {
  const meta = useMeta();
  const [tab, setTab] = React.useState<LType>("L");
  const emptyMsg = isSelf ? "Nothing here yet — share your first L." : "Nothing here yet.";
  // `/meta/enums` is the source of truth for the LType set and its order.
  const sectionTypes = meta.lType.map((o) => o.value);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const parsed = lTypeSchema.safeParse(value);
        if (parsed.success) setTab(parsed.data);
      }}
      className="mt-6"
    >
      <div className="overflow-x-auto pb-1">
        <TabsList className="w-max">
          {sectionTypes.map((t) => (
            <TabsTrigger key={t} value={t}>
              {typeSectionLabel(meta, t)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {sectionTypes.map((t) => (
        <TabsContent key={t} value={t} className="mt-6">
          <LsList username={username} type={t} empty={emptyMsg} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
