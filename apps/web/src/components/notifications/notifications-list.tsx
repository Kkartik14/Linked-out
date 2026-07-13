"use client";

import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/api";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { usePrincipal } from "@/components/session-provider";

export function NotificationsList() {
  const queryClient = useQueryClient();
  const principal = usePrincipal();

  // Infinite page — a DISTINCT key from the header's finite preview query (FRONTEND-01).
  const query = useInfiniteQuery({
    queryKey: queryKeys.notifications.infinite(principal),
    queryFn: ({ pageParam }) => getNotifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const invalidateAll = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(principal) });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => void invalidateAll(),
  });

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => void invalidateAll(),
  });

  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  const hasUnread = items.some((n) => n.readAt === null);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {hasUnread ? (
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState description="No notifications yet. When builders relate to your Ls, you'll hear about it here." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((n) => {
            const inner = (
              <div
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                  n.readAt === null ? "bg-accent/40" : "hover:bg-accent/30",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    n.readAt === null ? "bg-primary" : "bg-transparent",
                  )}
                />
                <div className="min-w-0">
                  <p className="text-sm leading-snug">{n.message}</p>
                  <time dateTime={n.createdAt} className="text-muted-foreground text-xs">
                    {timeAgo(n.createdAt)}
                  </time>
                </div>
              </div>
            );
            return (
              <li key={n.id}>
                {n.target ? (
                  <Link
                    href={`/ls/${n.target.lId}`}
                    className="block"
                    onClick={() => {
                      if (n.readAt === null) markOne.mutate(n.id);
                    }}
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}

      {query.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-4"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}
