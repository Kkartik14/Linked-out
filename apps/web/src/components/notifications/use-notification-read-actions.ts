"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { markAllNotificationsRead, markNotificationRead } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import {
  assertComposedPrincipal,
  useComposedPrincipal,
  usePrincipal,
} from "@/components/session-provider";

/** Owns the read-state mutation and cache policy shared by the bell preview and full page. */
export function useNotificationReadActions() {
  const queryClient = useQueryClient();
  const principal = usePrincipal();
  const composedAs = useComposedPrincipal();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(principal) });

  const markAll = useMutation({
    mutationKey: [...queryKeys.notifications.all(principal), "read-all"] as const,
    mutationFn: () => markAllNotificationsRead(assertComposedPrincipal(composedAs)),
    onSuccess: () => void invalidate(),
  });
  const markOne = useMutation({
    mutationKey: [...queryKeys.notifications.all(principal), "read-one"] as const,
    mutationFn: (id: string) => markNotificationRead(assertComposedPrincipal(composedAs), id),
    onSuccess: () => void invalidate(),
  });

  return { markAll, markOne };
}
