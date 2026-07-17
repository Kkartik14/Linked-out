import Link from "next/link";
import type { FeaturedL, InteractionWindow } from "@linkedout/contracts/v2";

import { SidebarSection } from "@/components/feed/sidebar/sidebar-section";

const DAY_MS = 86_400_000;

/**
 * Names the window the backend actually returned, rather than restating the contract's
 * seven days. If the window ever widens, this caption follows it instead of lying.
 *
 * TODO(contract): this is the frontend composing business copy, which the contract gives
 * it no licence to do — §2 supplies `interactionLabel` verbatim precisely so counts and
 * copy are the backend's, and §4 says the frontend "renders the supplied ordering, copy,
 * counts". No window caption is supplied today, so this derives one. It should become a
 * server-supplied `topLs.windowLabel`, at which point this function and `DAY_MS` go away.
 * Kept meanwhile: deleting the caption is a visible product change, not a cleanup.
 */
function windowCaption(window: InteractionWindow): string {
  const days = Math.round((Date.parse(window.endsAt) - Date.parse(window.startsAt)) / DAY_MS);
  // Both bounds are `z.iso.datetime()`, so they always parse to a finite number and no
  // `Number.isFinite` guard is reachable. Duration is a different question: nothing in
  // `interactionWindowSchema` orders the bounds or requires a whole day between them, so
  // an empty, inverted, or sub-day window would caption "Past 0 days" without this.
  if (days <= 0) return "";
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
      {/*
       * `items` order is authoritative — rendered as given, never re-ranked. An `ol`, not
       * a `ul`: the rank is the point of this rail, and the number beside each row is
       * `aria-hidden` decoration, so on a `ul` the backend's ranking was available to
       * sighted users only (WCAG 1.3.1). Preflight strips list styling from both, so this
       * is programmatically determinable order at no visual cost.
       */}
      <ol className="divide-border/60 divide-y border-t">
        {items.map((item, index) => (
          <li key={item.l.id}>
            <FeaturedRow item={item} rank={index + 1} />
          </li>
        ))}
      </ol>
    </SidebarSection>
  );
}
