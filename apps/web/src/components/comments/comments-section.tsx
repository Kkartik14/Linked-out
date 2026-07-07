"use client";

import * as React from "react";
import Link from "next/link";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { addComment, getComments } from "@/lib/api";
import { useSession } from "@/components/session-provider";
import { CommentForm } from "@/components/comments/comment-form";
import { CommentItem } from "@/components/comments/comment-item";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function CommentSkeleton() {
  return (
    <div className="flex gap-3">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    </div>
  );
}

export function CommentsSection({ lId, commentCount }: { lId: string; commentCount: number }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [countDelta, setCountDelta] = React.useState(0);

  const query = useInfiniteQuery({
    queryKey: ["comments", lId],
    queryFn: ({ pageParam }) => getComments(lId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const add = useMutation({
    mutationFn: (body: string) => addComment(lId, { body }),
    onSuccess: () => {
      setCountDelta((count) => count + 1);
      void queryClient.invalidateQueries({ queryKey: ["comments", lId] });
    },
  });

  const comments = query.data?.pages.flatMap((p) => p.data) ?? [];
  const visibleTotal = Math.max(commentCount + countDelta, comments.length);

  return (
    <section aria-label="Comments">
      <h2 className="mb-4 text-lg font-semibold">
        {visibleTotal > 0 ? `${visibleTotal} ${visibleTotal === 1 ? "comment" : "comments"}` : "Comments"}
      </h2>

      {user ? (
        <CommentForm
          placeholder="I experienced this too…"
          onSubmit={async (b) => {
            await add.mutateAsync(b);
          }}
        />
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          <Link href="/login" className="text-foreground font-medium hover:underline">
            Log in
          </Link>{" "}
          to join the conversation.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {query.isLoading ? (
          <>
            <CommentSkeleton />
            <CommentSkeleton />
          </>
        ) : comments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No comments yet. Be the first who&apos;s been there.
          </p>
        ) : (
          comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              lId={lId}
              onDeleted={() => setCountDelta((count) => count - 1)}
            />
          ))
        )}
      </div>

      {query.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-4"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          Load more comments
        </Button>
      ) : null}
    </section>
  );
}
