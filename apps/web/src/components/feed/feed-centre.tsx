import type { LCard, Paginated } from "@linkedout/contracts";

import type { FeedScope, FeedSort } from "@/lib/api";
import { FeedControls } from "@/components/feed/feed-controls";
import { FeedList } from "@/components/feed/feed-list";

export function FeedCentre({
  initial,
  scope,
  sort,
  canUseFollowingFeed,
  headingId = "feed-heading",
  headingAs: Heading = "h1",
  showIntroduction = true,
}: {
  initial?: Paginated<LCard>;
  scope: FeedScope;
  sort: FeedSort;
  canUseFollowingFeed: boolean;
  headingId?: string;
  headingAs?: "h1" | "h2";
  showIntroduction?: boolean;
}) {
  return (
    <>
      {showIntroduction ? (
        <div className="mb-5">
          <Heading id={headingId} className="text-2xl font-semibold tracking-tight">
            The Feed
          </Heading>
          <p className="text-muted-foreground text-sm">
            Honest career stories — the Ls, and what they taught.
          </p>
        </div>
      ) : null}
      <FeedControls scope={scope} sort={sort} canUseFollowingFeed={canUseFollowingFeed} />
      <FeedList key={`${scope}:${sort}`} initial={initial} scope={scope} sort={sort} />
    </>
  );
}
