import { feedSortSchema } from "@linkedout/contracts";

import { getFeed, getFeedSidebar, type FeedScope } from "@/lib/api";
import { getSession } from "@/lib/session";
import { publicReadFailure } from "@/lib/public-read";
import { FeedCentre } from "@/components/feed/feed-centre";
import { FeedShell } from "@/components/feed/feed-shell";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  // The feed is public and never gates: `unavailable` renders as a guest view (no viewer
  // context), not an error, so a sick `/auth/me` cannot take down public browsing.
  const loggedIn = (await getSession()).status === "authenticated";

  const scope: FeedScope = sp.scope === "following" && loggedIn ? "following" : "global";
  // A URL param is external input: let the contract's own schema validate it and fall back,
  // rather than asserting `as FeedSort` to make a hand-rolled membership check compile. A
  // sort added to the contract is picked up here with no edit.
  const sort = feedSortSchema.catch("latest").parse(sp.sort);

  const [initial, sidebar] = await Promise.all([
    getFeed({ scope, sort, limit: 20 }),
    // Ancillary: the rails fail independently of the feed (public contract §2). A rejection
    // leaves the page whole, and the rails retry client-side from their own query.
    getFeedSidebar().catch(() => undefined),
  ]).catch((err: unknown) => publicReadFailure(err, "/"));

  return (
    <FeedShell sidebar={sidebar} labelledBy="feed-heading">
      <FeedCentre
        initial={initial}
        scope={scope}
        sort={sort}
        canUseFollowingFeed={loggedIn}
      />
    </FeedShell>
  );
}
