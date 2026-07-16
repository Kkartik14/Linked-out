"use client";

import Link from "next/link";
// The one v1 island left in the app. v2's JourneyNode carries `createdAt`, but v1 never
// sends it — it sends the `eventDate ?? createdAt` alias as `date` and *orders by that
// alias*. Adopting the v2 node against the live v1 route would render a timeline sorted
// one way and labelled another (a backdated L would sort first but display its publish
// date). Migrate this file the moment GET /v2/users/:username/journey ships; the category
// and company lines are already gone, so only the date field and its import change.
import type { JourneyNode, Paginated } from "@linkedout/contracts";

import { getJourney } from "@/lib/api";
import { InfiniteList } from "@/components/infinite-list";
import { EmptyState } from "@/components/empty-state";
import { typeLabel, useMeta } from "@/components/meta-provider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { usePrincipal } from "@/components/session-provider";
import { queryKeys } from "@/lib/query-keys";

function TimelineNode({ node }: { node: JourneyNode }) {
  const meta = useMeta();

  return (
    <div className="border-border relative border-l pt-1 pb-6 pl-6">
      <span
        aria-hidden
        className="bg-primary ring-background absolute top-1.5 -left-[5px] size-2.5 rounded-full ring-4"
      />
      <time dateTime={node.date} className="text-muted-foreground text-xs">
        {formatDate(node.date)}
      </time>
      <Link href={`/ls/${node.id}`} className="mt-0.5 block font-medium text-balance hover:underline">
        {node.title}
      </Link>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant="secondary">{typeLabel(meta, node.type)}</Badge>
        {node.type === "BATTLE" ? (
          <Badge variant="outline" className={node.resolvedAt ? "text-muted-foreground" : ""}>
            {node.resolvedAt ? "Resolved" : "Ongoing"}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="border-border border-l pb-6 pl-6">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-4 w-2/3" />
      <Skeleton className="mt-2 h-5 w-20" />
    </div>
  );
}

export function JourneyTimeline({
  username,
  initial,
}: {
  username: string;
  initial?: Paginated<JourneyNode>;
}) {
  const principal = usePrincipal();
  return (
    <InfiniteList<JourneyNode>
      queryKey={queryKeys.users.journey(principal, username)}
      queryFn={(cursor) => getJourney(username, cursor)}
      initial={initial}
      getItemKey={(n) => n.id}
      renderItem={(node) => <TimelineNode node={node} />}
      empty={<EmptyState description="No journey entries yet." />}
      skeleton={
        <>
          <TimelineSkeleton />
          <TimelineSkeleton />
        </>
      }
    />
  );
}
