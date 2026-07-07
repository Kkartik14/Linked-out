"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Comment } from "@linkedout/contracts";

import { addReply, deleteComment, errorMessage, getReplies } from "@/lib/api";
import { useSession } from "@/components/session-provider";
import { statusOption, useMeta } from "@/components/meta-provider";
import { UserAvatar } from "@/components/user-avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CommentForm } from "@/components/comments/comment-form";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";

function CommentBody({ comment, lId, depth }: { comment: Comment; lId: string; depth: number }) {
  const { user } = useSession();
  const meta = useMeta();
  const queryClient = useQueryClient();
  const [replying, setReplying] = React.useState(false);
  const [showReplies, setShowReplies] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const status = comment.author ? statusOption(meta, comment.author.status) : undefined;

  const replies = useInfiniteQuery({
    queryKey: ["replies", comment.id],
    queryFn: ({ pageParam }) => getReplies(comment.id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: showReplies,
  });

  const reply = useMutation({
    mutationFn: (body: string) => addReply(comment.id, { body }),
    onSuccess: () => {
      setReplying(false);
      setShowReplies(true);
      queryClient.invalidateQueries({ queryKey: ["replies", comment.id] });
    },
  });

  const del = useMutation({
    mutationFn: () => deleteComment(comment.id),
    onSuccess: () => {
      setConfirmDelete(false);
      toast.success("Comment deleted.");
      queryClient.invalidateQueries({ queryKey: ["comments", lId] });
      queryClient.invalidateQueries({ queryKey: ["replies"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const replyItems = replies.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="flex gap-3">
      {comment.author ? (
        <Link href={`/u/${comment.author.username}`} aria-label={comment.author.name ?? comment.author.username}>
          <UserAvatar
            name={comment.author.name}
            username={comment.author.username}
            image={comment.author.image}
            statusDot={status?.dot}
            className="size-8"
          />
        </Link>
      ) : (
        <span aria-hidden className="bg-muted size-8 shrink-0 rounded-full" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          {comment.author ? (
            <Link href={`/u/${comment.author.username}`} className="font-medium hover:underline">
              {comment.author.name ?? comment.author.username}
            </Link>
          ) : (
            <span className="font-medium">Anonymous builder</span>
          )}
          <span className="text-muted-foreground text-xs">
            · <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>
          </span>
        </div>

        <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{comment.body}</p>

        <div className="text-muted-foreground mt-1.5 flex items-center gap-3 text-xs">
          {user && depth === 0 ? (
            <button type="button" className="hover:text-foreground" onClick={() => setReplying((v) => !v)}>
              Reply
            </button>
          ) : null}
          {comment.viewer.canDelete ? (
            <button
              type="button"
              className="hover:text-destructive inline-flex items-center gap-1"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          ) : null}
          {comment.replyCount > 0 ? (
            <button
              type="button"
              className="hover:text-foreground inline-flex items-center gap-1"
              onClick={() => setShowReplies((v) => !v)}
            >
              {showReplies ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}
            </button>
          ) : null}
        </div>

        {replying ? (
          <div className="mt-3">
            <CommentForm
              compact
              autoFocus
              placeholder="Write a reply…"
              submitLabel="Reply"
              onSubmit={async (b) => {
                await reply.mutateAsync(b);
              }}
            />
          </div>
        ) : null}

        {showReplies ? (
          <div className="border-border/60 mt-4 flex flex-col gap-4 border-l pl-4">
            {replies.isLoading ? (
              <p className="text-muted-foreground text-xs">Loading replies…</p>
            ) : (
              replyItems.map((r) => <CommentBody key={r.id} comment={r} lId={lId} depth={depth + 1} />)
            )}
            {replies.hasNextPage ? (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => replies.fetchNextPage()}
                disabled={replies.isFetchingNextPage}
              >
                Load more replies
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this comment?"
        description="This can't be undone."
        onConfirm={() => del.mutate()}
        busy={del.isPending}
      />
    </div>
  );
}

export function CommentItem({ comment, lId }: { comment: Comment; lId: string }) {
  return <CommentBody comment={comment} lId={lId} depth={0} />;
}
