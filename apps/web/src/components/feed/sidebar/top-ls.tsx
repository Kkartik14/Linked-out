import Link from "next/link";
import type { FeaturedL } from "@linkedout/contracts/v2";

import { SidebarSection } from "@/components/feed/sidebar/sidebar-section";

function FeaturedRow({ item, rank }: { item: FeaturedL; rank: number }) {
  const { l } = item;

  return (
    <div className="flex gap-2.5 px-4 py-2.5">
      {/* Full `--muted-foreground`, not `/70`: at 70% this computed 2.95:1 light / 3.47:1
          dark, under even the 3:1 non-text floor. `aria-hidden` does not exempt it — 1.4.3's
          incidental-text exception is for invisible or pictorial text, and a low-vision
          sighted reader still has to read the rank. Size and position already de-emphasise
          it without help from the contrast. */}
      <span aria-hidden className="text-muted-foreground w-3 pt-0.5 text-xs tabular-nums">
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

/** `windowLabel` is server-composed copy, like `interactionLabel`. Rendered verbatim. */
export function TopLs({ items, windowLabel }: { items: FeaturedL[]; windowLabel: string }) {
  if (items.length === 0) return null;

  return (
    <SidebarSection title="Top Ls" caption={windowLabel}>
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
