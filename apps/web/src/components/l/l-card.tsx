"use client";

import Link from "next/link";
import type { LCard as LCardType } from "@linkedout/contracts";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { ReactionBar } from "@/components/l/reaction-bar";
import { categoryLabel, statusOption, typeLabel, useMeta } from "@/components/meta-provider";
import { formatDate, timeAgo } from "@/lib/format";

export function LCard({ l }: { l: LCardType }) {
  const meta = useMeta();
  const cat = categoryLabel(meta, l.category);
  const isBattle = l.type === "BATTLE";
  const status = l.author ? statusOption(meta, l.author.status) : undefined;
  const href = `/ls/${l.id}`;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {/* Author + type */}
      <div className="flex items-center gap-2.5 px-5 pt-4">
        {l.author ? (
          <>
            <Link href={`/u/${l.author.username}`} aria-label={l.author.name ?? l.author.username}>
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

        {l.lessonLearned ? (
          <div className="border-primary/50 bg-muted/40 mt-3 rounded-md border-l-2 px-3 py-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Lesson learned
            </p>
            <p className="mt-0.5 text-sm">{l.lessonLearned}</p>
          </div>
        ) : null}

        {cat || l.company || l.eventDate ? (
          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-xs">
            {cat ? (
              <Badge variant="outline" className="font-normal">
                {cat}
              </Badge>
            ) : null}
            {l.company ? <span>{l.company}</span> : null}
            {l.eventDate ? (
              <span>
                <time dateTime={l.eventDate}>{formatDate(l.eventDate)}</time>
              </span>
            ) : null}
          </div>
        ) : null}

        {l.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {l.tags.map((tag) => (
              <Link
                key={tag}
                href={`/search?q=${encodeURIComponent(tag)}`}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                #{tag}
              </Link>
            ))}
          </div>
        ) : null}
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
