"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LDetail } from "@linkedout/contracts/v2";

import { deleteL, errorMessage, patchL } from "@/lib/api";
import { statusOption, typeLabel, useMeta } from "@/components/meta-provider";
import { UserAvatar } from "@/components/user-avatar";
import { ReactionBar } from "@/components/l/reaction-bar";
import { SaveToCollectionButton } from "@/components/collections/save-to-collection-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";

export function LDetailView({ l }: { l: LDetail }) {
  const meta = useMeta();
  const router = useRouter();

  const [resolvedAt, setResolvedAt] = React.useState(l.resolvedAt);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const status = l.author ? statusOption(meta, l.author.status) : undefined;
  const isBattle = l.type === "BATTLE";

  const del = useMutation({
    mutationFn: () => deleteL(l.id),
    onSuccess: () => {
      toast.success("Your L was deleted.");
      router.push("/");
      router.refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const resolve = useMutation({
    mutationFn: (on: boolean) => patchL(l.id, { resolvedAt: on ? new Date() : null }),
    onSuccess: (updated) => {
      setResolvedAt(updated.resolvedAt);
      toast.success(updated.resolvedAt ? "Marked as resolved." : "Reopened.");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">
        ← Back to the feed
      </Link>

      <div className="mt-4 flex items-start gap-3">
        {l.author ? (
          // Decorative: the name below links to the same profile. Naming this one instead
          // would leave two identical tab stops; hiding it also fixes an empty accessible
          // name, since the avatar's `alt` is "" and the initials fallback unmounts once
          // the image loads — leaving the link with no content to name it at all.
          <Link href={`/u/${l.author.username}`} tabIndex={-1} aria-hidden>
            <UserAvatar
              name={l.author.name}
              username={l.author.username}
              image={l.author.image}
              statusDot={status?.dot}
              className="size-10"
            />
          </Link>
        ) : (
          <span aria-hidden className="bg-muted size-10 shrink-0 rounded-full" />
        )}
        <div className="min-w-0 flex-1">
          {l.author ? (
            <Link href={`/u/${l.author.username}`} className="font-medium hover:underline">
              {l.author.name ?? l.author.username}
            </Link>
          ) : (
            <span className="font-medium">Anonymous builder</span>
          )}
          <p className="text-muted-foreground text-xs">
            {l.author ? `@${l.author.username} · ` : ""}
            <time dateTime={l.createdAt}>{timeAgo(l.createdAt)}</time>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary">{typeLabel(meta, l.type)}</Badge>
          {isBattle ? (
            <Badge variant="outline" className={resolvedAt ? "text-muted-foreground" : ""}>
              {resolvedAt ? "Resolved" : "Ongoing"}
            </Badge>
          ) : null}
        </div>
      </div>

      <h1 className="mt-4 text-2xl leading-tight font-semibold tracking-tight text-balance">
        {l.title}
      </h1>

      <div className="mt-5 text-[15px] leading-relaxed whitespace-pre-line">{l.story}</div>

      {l.collections.length > 0 ? (
        <div className="mt-5">
          <p className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
            In collections
          </p>
          <div className="flex flex-wrap gap-2">
            {l.collections.map((c) => (
              <Link key={c.id} href={`/collections/${c.id}`}>
                <Badge variant="secondary" className="hover:bg-secondary/70">
                  {c.title}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {l.viewer.canEdit ? (
        <SaveToCollectionButton
          lId={l.id}
          existingCollectionIds={l.collections.map((collection) => collection.id)}
          className="mt-5"
        />
      ) : null}

      <div className="mt-6 border-y py-2">
        <ReactionBar
          lId={l.id}
          reactions={l.reactions}
          viewerReactions={l.viewer.reactions}
          commentCount={l.commentCount}
          commentHref="#comments"
        />
      </div>

      {l.viewer.canEdit ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/ls/${l.id}/edit`}>
              <Pencil className="size-4" />
              Edit
            </Link>
          </Button>
          {isBattle ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => resolve.mutate(!resolvedAt)}
              disabled={resolve.isPending}
            >
              {resolvedAt ? <RotateCcw className="size-4" /> : <CircleCheck className="size-4" />}
              {resolvedAt ? "Reopen" : "Mark resolved"}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this L?"
        description="This permanently removes the story and its comments. This can't be undone."
        onConfirm={() => del.mutate()}
        busy={del.isPending}
      />
    </>
  );
}
