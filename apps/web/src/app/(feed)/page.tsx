import { feedFilterSchema, feedSortSchema } from "@linkedout/contracts";

import { getFeed, type FeedScope, type FeedSort } from "@/lib/api";
import { getSession } from "@/lib/session";
import { FeedControls } from "@/components/feed/feed-controls";
import { FeedList } from "@/components/feed/feed-list";

const SORTS = new Set<FeedSort>(feedSortSchema.options);
const CATEGORY_SLUGS = new Set<string>(feedFilterSchema.options);

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; sort?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  const loggedIn = session.user !== null;

  const scope: FeedScope = sp.scope === "following" && loggedIn ? "following" : "global";
  const sort: FeedSort = SORTS.has(sp.sort as FeedSort) ? (sp.sort as FeedSort) : "latest";
  const filter =
    sp.filter && CATEGORY_SLUGS.has(sp.filter.toLowerCase()) ? sp.filter.toLowerCase() : null;

  const initial = await getFeed({ scope, sort, filter: filter ?? undefined, limit: 20 });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">The Feed</h1>
        <p className="text-muted-foreground text-sm">
          Honest career stories — the Ls, and what they taught.
        </p>
      </div>

      <FeedControls scope={scope} sort={sort} filter={filter} canFollow={loggedIn} />
      <FeedList
        key={`${scope}:${sort}:${filter ?? "all"}`}
        initial={initial}
        scope={scope}
        sort={sort}
        filter={filter}
      />
    </div>
  );
}
