"use client";

import Link from "next/link";
import type { LCard as LCardType } from "@linkedout/contracts/v2";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { ReactionBar } from "@/components/l/reaction-bar";
import { statusOption, typeLabel, useMeta } from "@/components/meta-provider";
import { timeAgo } from "@/lib/format";

export function LCard({ l }: { l: LCardType }) {
  const meta = useMeta();
  const isBattle = l.type === "BATTLE";
  const status = l.author ? statusOption(meta, l.author.status) : undefined;
  const href = `/ls/${l.id}`;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {/* Author + type */}
      <div className="flex items-center gap-2.5 px-5 pt-4">
        {l.author ? (
          <>
            {/* Decorative: the name beside it links to the same profile, so naming this
                too would put two identical tab stops on every card in the feed. */}
            <Link href={`/u/${l.author.username}`} tabIndex={-1} aria-hidden>
              <UserAvatar
                name={l.author.name}
                username={l.author.username}
                image={l.author.image}
                statusDot={status?.dot}
                className="size-9"
              />
            </Link>
            <div className="flex min-w-0 flex-col leading-tight">
              <Link
                href={`/u/${l.author.username}`}
                className="truncate text-sm font-medium hover:underline"
              >
                {l.author.name ?? l.author.username}
              </Link>
              <span className="text-muted-foreground truncate text-xs">
                @{l.author.username} · <time dateTime={l.createdAt}>{timeAgo(l.createdAt)}</time>
              </span>
            </div>
          </>
        ) : (
          <>
            <span aria-hidden className="bg-muted size-9 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="text-sm font-medium">Anonymous builder</span>
              <span className="text-muted-foreground truncate text-xs">
                <time dateTime={l.createdAt}>{timeAgo(l.createdAt)}</time>
              </span>
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Badge variant="secondary">{typeLabel(meta, l.type)}</Badge>
          {isBattle ? (
            <Badge variant="outline" className={l.resolvedAt ? "text-muted-foreground" : ""}>
              {l.resolvedAt ? "Resolved" : "Ongoing"}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pt-3 pb-4">
        <Link href={href} className="group block">
          <h2 className="text-lg leading-snug font-semibold tracking-tight text-balance group-hover:underline">
            {l.title}
          </h2>
        </Link>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{l.storyPreview}</p>
      </div>

      {/* Actions */}
      <div className="border-t px-3 py-1.5">
        <ReactionBar
          lId={l.id}
          reactions={l.reactions}
          viewerReactions={l.viewer.reactions}
          commentCount={l.commentCount}
          commentHref={`${href}#comments`}
        />
      </div>
    </Card>
  );
}
