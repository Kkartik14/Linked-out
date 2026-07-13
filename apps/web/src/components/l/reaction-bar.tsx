"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, MessageCircle } from "lucide-react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ReactionResult, ReactionsSummary, ReactionType } from "@linkedout/contracts";

import { addReaction, removeReaction, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { usePrincipal, useSession } from "@/components/session-provider";
import { reactionOption, useMeta } from "@/components/meta-provider";
import { cn } from "@/lib/utils";

const EXPRESSIVE: ReactionType[] = ["BEEN_THERE", "HELPFUL", "RESPECT", "PAIN"];
const COUNT_KEY: Record<ReactionType, keyof ReactionsSummary> = {
  BEEN_THERE: "beenThere",
  HELPFUL: "helpful",
  RESPECT: "respect",
  PAIN: "pain",
  SAVED: "saved",
};

function optimisticReaction(
  current: ReactionResult,
  type: ReactionType,
  willAdd: boolean,
): ReactionResult {
  const key = COUNT_KEY[type];
  const delta = willAdd ? 1 : -1;
  const viewerReactions = willAdd
    ? [...new Set([...current.viewer.reactions, type])]
    : current.viewer.reactions.filter((reaction) => reaction !== type);

  return {
    reactions: {
      ...current.reactions,
      [key]: Math.max(0, current.reactions[key] + delta),
      // `reactionCount` includes every Reaction row, including the private SAVED type.
      // SAVED has zero *popularity* weight; it still changes the reaction total.
      total: Math.max(0, current.reactions.total + delta),
    },
    viewer: { reactions: viewerReactions },
  };
}

export function ReactionBar({
  lId,
  reactions,
  viewerReactions,
  commentCount,
  commentHref,
}: {
  lId: string;
  reactions: ReactionsSummary;
  viewerReactions: ReactionType[];
  commentCount: number;
  commentHref: string;
}) {
  const { user } = useSession();
  const principal = usePrincipal();
  const meta = useMeta();
  const router = useRouter();
  const queryClient = useQueryClient();

  const serverSnapshot = JSON.stringify([
    reactions.total,
    reactions.beenThere,
    reactions.helpful,
    reactions.respect,
    reactions.pain,
    reactions.saved,
    viewerReactions,
  ]);
  const reactionKey = useMemo(
    () => queryKeys.ls.reactions(principal, lId),
    [principal, lId],
  );
  const mutationKey = useMemo(() => [...reactionKey, "toggle"] as const, [reactionKey]);
  const initialReaction = useMemo<ReactionResult>(
    () => ({ reactions, viewer: { reactions: viewerReactions } }),
    [reactions, viewerReactions],
  );
  const reconciledServerSnapshot = useRef<string | null>(null);
  const reactionQuery = useQuery({
    queryKey: reactionKey,
    queryFn: async () => initialReaction,
    initialData: initialReaction,
    enabled: false,
    staleTime: Infinity,
  });
  const commentCountQuery = useQuery({
    queryKey: queryKeys.ls.commentCount(principal, lId),
    queryFn: async () => commentCount,
    initialData: commentCount,
    enabled: false,
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationKey,
    // TanStack serializes every mutation sharing this scope, even when the same L is
    // rendered by multiple component instances (for example, a card and a detail pane).
    scope: { id: `reaction:${principal}:${lId}` },
    mutationFn: ({ type, willAdd }: { type: ReactionType; willAdd: boolean }) =>
      willAdd ? addReaction(lId, type) : removeReaction(lId, type),
    onMutate: async ({ type, willAdd }) => {
      await queryClient.cancelQueries({ queryKey: reactionKey, exact: true });
      const previous = queryClient.getQueryData<ReactionResult>(reactionKey) ?? initialReaction;
      queryClient.setQueryData(reactionKey, optimisticReaction(previous, type, willAdd));
      return { previous };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(reactionKey, context.previous);
      toast.error(errorMessage(err, "Could not save your reaction."));
    },
    onSuccess: (result, { type }) => {
      queryClient.setQueryData(reactionKey, result);
      if (type === "SAVED") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.saved.all(principal) });
      }
    },
  });

  useEffect(() => {
    const isInitialSnapshot = reconciledServerSnapshot.current === null;
    if (reconciledServerSnapshot.current === serverSnapshot) return;
    // Mark the snapshot even when skipped: a server render racing a mutation may predate
    // that write, while the mutation's response is the authoritative successor.
    reconciledServerSnapshot.current = serverSnapshot;
    if (queryClient.isMutating({ mutationKey }) > 0) return;
    if (isInitialSnapshot) {
      const observers =
        queryClient
          .getQueryCache()
          .find({ queryKey: reactionKey, exact: true })
          ?.getObserversCount() ?? 0;
      // `initialData` seeds an empty key. If another view already observes this key, its
      // canonical cache may contain a navigation or mutation successor; a late sibling's
      // older props have no revision with which to prove otherwise and must not replace it.
      if (observers > 1) return;
    }
    // RSC/API reads are no-store. Reconcile a newer navigation snapshot into the shared
    // cache when this mounted view receives changed props. A sole remount may also refresh
    // a retained, unobserved cache entry.
    queryClient.setQueryData(reactionKey, initialReaction);
  }, [initialReaction, mutationKey, queryClient, reactionKey, serverSnapshot]);

  const isPending = useIsMutating({ mutationKey }) > 0;
  const summary = reactionQuery.data.reactions;
  const mine = new Set(reactionQuery.data.viewer.reactions);
  const canonicalCommentCount = commentCountQuery.data;

  function toggle(type: ReactionType) {
    if (!user) {
      toast("Log in to react to this L.", {
        action: { label: "Log in", onClick: () => router.push("/login") },
      });
      return;
    }
    if (isPending) return;

    mutation.mutate({ type, willAdd: !mine.has(type) });
  }

  const savedActive = mine.has("SAVED");

  return (
    <div className="flex items-center gap-0.5">
      {EXPRESSIVE.map((type) => {
        const option = reactionOption(meta, type);
        const count = summary[COUNT_KEY[type]];
        const active = mine.has(type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            disabled={isPending}
            aria-pressed={active}
            aria-label={`${option?.label ?? type}${count ? `, ${count}` : ""}`}
            className={cn(
              "hover:bg-accent inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm transition-colors",
              active && "bg-accent text-foreground font-medium",
            )}
          >
            <span aria-hidden className="text-base leading-none">
              {option?.emoji}
            </span>
            {count > 0 ? (
              <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
            ) : null}
          </button>
        );
      })}

      <Link
        href={commentHref}
        className="text-muted-foreground hover:bg-accent hover:text-foreground ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm transition-colors"
        aria-label={`${canonicalCommentCount} comments`}
      >
        <MessageCircle className="size-4" />
        {canonicalCommentCount > 0 ? (
          <span className="text-xs tabular-nums">{canonicalCommentCount}</span>
        ) : null}
      </Link>

      <button
        type="button"
        onClick={() => toggle("SAVED")}
        disabled={isPending}
        aria-pressed={savedActive}
        aria-label={savedActive ? "Remove from saved" : "Save"}
        className={cn(
          "hover:bg-accent text-muted-foreground ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm transition-colors",
          savedActive && "text-foreground",
        )}
      >
        <Bookmark className={cn("size-4", savedActive && "fill-current")} />
        {summary.saved > 0 ? <span className="text-xs tabular-nums">{summary.saved}</span> : null}
      </button>
    </div>
  );
}
