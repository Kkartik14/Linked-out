"use client";

import Link from "next/link";
import type { FeedSidebarResponse } from "@linkedout/contracts";

import { statusOption, useMeta } from "@/components/meta-provider";
import { UserAvatar } from "@/components/user-avatar";
import { SidebarSection } from "@/components/feed/sidebar/sidebar-section";

type Daily = NonNullable<FeedSidebarResponse["lOfTheDay"]>;

/**
 * The one L the backend picked for today, from the previous completed UTC day.
 *
 * Its author is guaranteed present by the contract — `AttributedFeaturedL` types
 * `isAnonymous` as `false` and `author` as non-null — so there is no anonymous branch to
 * handle here, unlike Top Ls. Absent means no candidate qualified; the slot is never
 * filled with something else.
 */
export function LOfTheDay({ daily }: { daily: Daily | null }) {
  const meta = useMeta();
  if (!daily) return null;

  const { l, interactionLabel } = daily.item;
  const status = statusOption(meta, l.author.status);
  const name = l.author.name ?? l.author.username;

  return (
    <SidebarSection title="L of the day">
      <div className="border-t px-4 pt-3 pb-4">
        <div className="flex items-center gap-2">
          <Link href={`/u/${l.author.username}`} tabIndex={-1} aria-hidden>
            <UserAvatar
              name={l.author.name}
              username={l.author.username}
              image={l.author.image}
              statusDot={status?.dot}
              className="size-7"
            />
          </Link>
          <Link
            href={`/u/${l.author.username}`}
            className="min-w-0 truncate text-xs font-medium hover:underline"
          >
            {name}
          </Link>
        </div>

        <Link href={`/ls/${l.id}`} className="group mt-2 block">
          <h3 className="text-sm leading-snug font-semibold text-balance group-hover:underline">
            {l.title}
          </h3>
          <p className="text-muted-foreground mt-1.5 line-clamp-3 text-xs leading-relaxed">
            {l.storyPreview}
          </p>
        </Link>

        {/* Server-composed count copy. Verbatim. */}
        <p className="text-muted-foreground mt-2.5 text-xs">{interactionLabel}</p>
      </div>
    </SidebarSection>
  );
}
