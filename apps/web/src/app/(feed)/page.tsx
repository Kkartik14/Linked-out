import { feedSortSchema } from "@linkedout/contracts/v2";

import { getFeed, getFeedSidebar, type FeedScope, type FeedSort } from "@/lib/api";
import { getSession } from "@/lib/session";
import { FeedControls } from "@/components/feed/feed-controls";
import { FeedList } from "@/components/feed/feed-list";
import { FeedSidebarLeft, FeedSidebarRight } from "@/components/feed/sidebar/feed-sidebar";

const SORTS = new Set<FeedSort>(feedSortSchema.options);

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  const loggedIn = session.user !== null;

  const scope: FeedScope = sp.scope === "following" && loggedIn ? "following" : "global";
  const sort: FeedSort = SORTS.has(sp.sort as FeedSort) ? (sp.sort as FeedSort) : "latest";

  const [initial, sidebar] = await Promise.all([
    getFeed({ scope, sort, limit: 20 }),
    // Ancillary: the rails fail independently of the feed (contract v2 §2). A rejection
    // leaves the page whole, and the rails retry client-side from their own query.
    getFeedSidebar().catch(() => undefined),
  ]);

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

      {/* `min-w-0` stops a long unbroken title from widening the grid track. */}
      <div className="min-w-0">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">The Feed</h1>
          <p className="text-muted-foreground text-sm">
            Honest career stories — the Ls, and what they taught.
          </p>
        </div>

        <FeedControls scope={scope} sort={sort} canFollow={loggedIn} />
        <FeedList key={`${scope}:${sort}`} initial={initial} scope={scope} sort={sort} />
      </div>

      <FeedSidebarRight initial={sidebar} />
    </div>
  );
}
