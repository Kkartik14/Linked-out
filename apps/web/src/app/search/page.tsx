import type { Metadata } from "next";
import { feedSortSchema } from "@linkedout/contracts";

import { getFeed, getFeedSidebar, searchLs, searchUsers, type FeedScope } from "@/lib/api";
import { getSession } from "@/lib/session";
import { publicReadFailure, redirectIfCredentialRejected } from "@/lib/public-read";
import { FeedCentre } from "@/components/feed/feed-centre";
import { FeedShell } from "@/components/feed/feed-shell";
import { SearchClient } from "@/components/search/search-client";

interface SearchParams {
  q?: string;
  type?: string;
  focus?: string;
  scope?: string;
  sort?: string;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return { title: sp.q ? `Search: ${sp.q}` : "Search" };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const type = sp.type === "users" ? "users" : "ls";
  const session = await getSession();
  const loggedIn = session.status === "authenticated";
  const scope: FeedScope = sp.scope === "following" && loggedIn ? "following" : "global";
  const sort = feedSortSchema.catch("latest").parse(sp.sort);
  const sidebarPromise = getFeedSidebar().catch(() => undefined);

  const returnParams = new URLSearchParams();
  if (q) returnParams.set("q", q);
  if (type === "users") returnParams.set("type", "users");
  const returnTo = returnParams.size ? `/search?${returnParams}` : "/search";
  const swallowSearchFailure = (err: unknown) => {
    redirectIfCredentialRejected(err, returnTo);
    return undefined;
  };

  const [initialLs, initialUsers, initialFeed] = await Promise.all([
    q && type === "ls" ? searchLs(q).catch(swallowSearchFailure) : undefined,
    q && type === "users" ? searchUsers(q).catch(swallowSearchFailure) : undefined,
    !q
      ? getFeed({ scope, sort, limit: 20 }).catch((err: unknown) => publicReadFailure(err, returnTo))
      : undefined,
  ]);
  const sidebar = await sidebarPromise;

  return (
    <FeedShell sidebar={sidebar} labelledBy="search-heading">
      <SearchClient
        q={q}
        type={type}
        initialLs={initialLs}
        initialUsers={initialUsers}
        focusInput={sp.focus === "1"}
        emptyContent={
          <FeedCentre
            initial={initialFeed}
            scope={scope}
            sort={sort}
            canUseFollowingFeed={loggedIn}
            headingId="search-feed-heading"
            headingAs="h2"
            showIntroduction={false}
          />
        }
      />
    </FeedShell>
  );
}
