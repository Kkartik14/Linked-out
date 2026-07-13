"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { usePrincipal } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function notificationPollIntervalMs(random = Math.random): number {
  return 40_000 + Math.floor(random() * 10_001);
}

export function NotificationsBell() {
  const queryClient = useQueryClient();
  const principal = usePrincipal();
  const [open, setOpen] = useState(false);

  const unread = useQuery({
    queryKey: queryKeys.notifications.unreadCount(principal),
    queryFn: getUnreadCount,
    // Spread clients across the allowed 30–60s window instead of creating a 45s herd.
    refetchInterval: () => notificationPollIntervalMs(),
  });

  // Finite page for the dropdown — a DISTINCT key from the infinite page list
  // (FRONTEND-01: a shared key stored incompatible shapes and could crash the page).
  const list = useQuery({
    queryKey: queryKeys.notifications.preview(principal),
    queryFn: () => getNotifications(undefined, 5),
    enabled: open,
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

  const count = unread.data?.count ?? 0;
  const items = list.data?.data ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${count ? `, ${count} unread` : ""}`}>
          <Bell />
          {count > 0 ? (
            <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto py-1">
          {list.isLoading ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              No notifications yet.
            </p>
          ) : (
            items.map((n) => {
              const body = (
                <div
                  className={cn(
                    "flex items-start gap-2 px-3 py-2.5 text-sm",
                    n.readAt === null && "bg-accent/40",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.readAt === null ? "bg-primary" : "bg-transparent",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block leading-snug">{n.message}</span>
                    <time className="text-muted-foreground text-xs">{timeAgo(n.createdAt)}</time>
                  </span>
                </div>
              );
              return n.target ? (
                <Link
                  key={n.id}
                  href={`/ls/${n.target.lId}`}
                  className="hover:bg-accent block"
                  onClick={() => {
                    if (n.readAt === null) markOne.mutate(n.id);
                  }}
                >
                  {body}
                </Link>
              ) : (
                <div key={n.id}>{body}</div>
              );
            })
          )}
        </div>
        <Link
          href="/notifications"
          className="text-muted-foreground hover:text-foreground block border-t px-3 py-2 text-center text-xs"
        >
          View all
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
