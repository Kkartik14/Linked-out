"use client";

import Link from "next/link";
import type { FeaturedL, InteractionWindow } from "@linkedout/contracts/v2";

import { SidebarSection } from "@/components/feed/sidebar/sidebar-section";

const DAY_MS = 86_400_000;

/**
 * Names the window the backend actually returned, rather than restating the contract's
 * seven days. If the window ever widens, this caption follows it instead of lying.
 */
export function windowCaption(window: InteractionWindow): string {
  const days = Math.round((Date.parse(window.endsAt) - Date.parse(window.startsAt)) / DAY_MS);
  if (!Number.isFinite(days) || days <= 0) return "";
  return days === 1 ? "Past 24 hours" : `Past ${days} days`;
}

function FeaturedRow({ item, rank }: { item: FeaturedL; rank: number }) {
  const { l } = item;

  return (
    <div className="flex gap-2.5 px-4 py-2.5">
      <span aria-hidden className="text-muted-foreground/70 w-3 pt-0.5 text-xs tabular-nums">
        {rank}
      </span>
      <div className="min-w-0">
        <Link
          href={`/ls/${l.id}`}
          className="line-clamp-2 text-sm leading-snug font-medium hover:underline"
        >
          {l.title}
        </Link>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">
          {l.author ? (
            <Link href={`/u/${l.author.username}`} className="hover:text-foreground">
              {l.author.name ?? l.author.username}
            </Link>
          ) : (
            // Anonymous Ls are eligible here, and stay unattributed (contract §2).
            <span>Anonymous builder</span>
          )}
          {" · "}
          {/* Server-composed count copy. Verbatim. */}
          <span>{item.interactionLabel}</span>
        </p>
      </div>
    </div>
  );
}

export function TopLs({ items, window }: { items: FeaturedL[]; window: InteractionWindow }) {
  if (items.length === 0) return null;

  return (
    <SidebarSection title="Top Ls" caption={windowCaption(window)}>
      {/* `items` order is authoritative — rendered as given, never re-ranked. */}
      <ul className="divide-border/60 divide-y border-t">
        {items.map((item, index) => (
          <li key={item.l.id}>
            <FeaturedRow item={item} rank={index + 1} />
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}
