import { feedSortSchema } from "@linkedout/contracts/v2";

import { getFeed, getFeedSidebar, type FeedScope } from "@/lib/api";
import { getSession } from "@/lib/session";
import { publicReadFailure } from "@/lib/public-read";
import { FeedControls } from "@/components/feed/feed-controls";
import { FeedList } from "@/components/feed/feed-list";
import { FeedSidebarLeft, FeedSidebarRight } from "@/components/feed/sidebar/feed-sidebar";

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
    // Ancillary: the rails fail independently of the feed (contract v2 §2). A rejection
    // leaves the page whole, and the rails retry client-side from their own query.
    getFeedSidebar().catch(() => undefined),
  ]).catch((err: unknown) => publicReadFailure(err, "/"));

  return (
    /**
     * Three columns at xl, two at lg (the right rail is the first to go), one below that.
     *
     * The rails are hidden rather than stacked on narrow screens: the centre column is an
     * infinite feed, so anything placed after it is unreachable, and stacking four
     * discovery boxes above it would bury the product behind its own sidebar.
     */
    <div className="mx-auto grid w-full max-w-[80rem] grid-cols-1 items-start gap-6 px-4 py-6 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,42rem)_19rem]">
      <FeedSidebarLeft initial={sidebar} />

      {/*
       * A labelled region, so the feed is addressable in a page whose other two columns
       * are `complementary` landmarks — the same L can legitimately appear both here and
       * in a rail, and "the feed" has to mean something specific to a screen reader
       * moving between landmarks.
       *
       * `min-w-0` stops a long unbroken title from widening the grid track.
       */}
      <section aria-labelledby="feed-heading" className="min-w-0">
        <div className="mb-5">
          <h1 id="feed-heading" className="text-2xl font-semibold tracking-tight">
            The Feed
          </h1>
          <p className="text-muted-foreground text-sm">
            Honest career stories — the Ls, and what they taught.
          </p>
        </div>

        <FeedControls scope={scope} sort={sort} canUseFollowingFeed={loggedIn} />
        <FeedList key={`${scope}:${sort}`} initial={initial} scope={scope} sort={sort} />
      </section>

      <FeedSidebarRight initial={sidebar} />
    </div>
  );
}
