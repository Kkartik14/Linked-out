"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Comment } from "@linkedout/contracts";

import { addReply, deleteComment, errorMessage, getReplies } from "@/lib/api";
import {
  appendComment,
  flattenComments,
  removeComment,
  updateComment,
  type CommentPages,
} from "@/lib/comment-cache";
import { queryKeys } from "@/lib/query-keys";
import { useComposedPrincipal, usePrincipal, useViewer } from "@/components/session-provider";
import { statusOption, useMeta } from "@/components/meta-provider";
import { UserAvatar } from "@/components/user-avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CommentForm } from "@/components/comments/comment-form";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";

function CommentBody({
  comment,
  lId,
  depth,
}: {
  comment: Comment;
  lId: string;
  depth: number;
}) {
  const user = useViewer();
  const principal = usePrincipal();
  const composedAs = useComposedPrincipal();
  const meta = useMeta();
  const queryClient = useQueryClient();
  const [replying, setReplying] = React.useState(false);
  const [showReplies, setShowReplies] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const replyCount = comment.replyCount;
  const commentsKey = queryKeys.comments.list(principal, lId);
  const repliesKey = queryKeys.comments.replies(principal, comment.id);
  const commentCountKey = queryKeys.ls.commentCount(principal, lId);

  const status = comment.author ? statusOption(meta, comment.author.status) : undefined;

  const replies = useInfiniteQuery({
    queryKey: repliesKey,
    queryFn: ({ pageParam }) => getReplies(comment.id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: showReplies,
  });

  const reply = useMutation({
    mutationFn: (body: string) => addReply(composedAs, comment.id, { body }),
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: repliesKey, exact: true }),
        queryClient.cancelQueries({ queryKey: commentsKey, exact: true }),
      ]);
    },
    onSuccess: (created) => {
      setReplying(false);
      setShowReplies(true);
      queryClient.setQueryData<CommentPages>(repliesKey, (current) =>
        appendComment(current, created),
      );
      queryClient.setQueryData<CommentPages>(commentsKey, (current) =>
        updateComment(current, comment.id, (parent) => ({
          ...parent,
          replyCount: parent.replyCount + 1,
        })),
      );
      queryClient.setQueryData<number>(commentCountKey, (current) => (current ?? 0) + 1);
      void queryClient.invalidateQueries({ queryKey: repliesKey, exact: true });
    },
  });

  // Hoisted: TS drops property-access narrowing inside the closures below, so
  // branching on `comment.parentId` there would need a non-null assertion.
  const parentId = comment.parentId;

  const del = useMutation({
    mutationFn: () => deleteComment(composedAs, comment.id),
    onMutate: async () => {
      const affectedRepliesKey = parentId
        ? queryKeys.comments.replies(principal, parentId)
        : repliesKey;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: commentsKey, exact: true }),
        queryClient.cancelQueries({ queryKey: affectedRepliesKey, exact: true }),
      ]);
    },
    onSuccess: () => {
      setConfirmDelete(false);
      toast.success("Comment deleted.");

      if (parentId) {
        const parentRepliesKey = queryKeys.comments.replies(principal, parentId);
        queryClient.setQueryData<CommentPages>(parentRepliesKey, (current) =>
          removeComment(current, comment.id),
        );
        queryClient.setQueryData<CommentPages>(commentsKey, (current) =>
          updateComment(current, parentId, (parent) => ({
            ...parent,
            replyCount: Math.max(0, parent.replyCount - 1),
          })),
        );
        queryClient.setQueryData<number>(commentCountKey, (current) =>
          Math.max(0, (current ?? 0) - 1),
        );
      } else {
        queryClient.setQueryData<CommentPages>(commentsKey, (current) =>
          removeComment(current, comment.id),
        );
        queryClient.removeQueries({ queryKey: repliesKey, exact: true });
        queryClient.setQueryData<number>(commentCountKey, (current) =>
          Math.max(0, (current ?? 0) - 1 - comment.replyCount),
        );
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const replyItems = flattenComments(replies.data);

  return (
    <div className="flex gap-3">
      {comment.author ? (
        // Decorative: the name below links to the same profile. Two identical stops per
        // comment adds up fast in a long thread.
        <Link href={`/u/${comment.author.username}`} tabIndex={-1} aria-hidden>
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
            <button
              type="button"
              className="hover:text-foreground"
              aria-expanded={replying}
              onClick={() => setReplying((v) => !v)}
            >
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
          {replyCount > 0 ? (
            <button
              type="button"
              className="hover:text-foreground inline-flex items-center gap-1"
              aria-expanded={showReplies}
              onClick={() => setShowReplies((v) => !v)}
            >
              {showReplies ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
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
              replyItems.map((r) => (
                <CommentBody
                  key={r.id}
                  comment={r}
                  lId={lId}
                  depth={depth + 1}
                />
              ))
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
