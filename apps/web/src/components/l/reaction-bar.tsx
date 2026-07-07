"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, MessageCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ReactionsSummary, ReactionType } from "@linkedout/contracts";

import { addReaction, removeReaction, errorMessage } from "@/lib/api";
import { useSession } from "@/components/session-provider";
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

function reactionStateKey(reactions: ReactionsSummary, viewerReactions: ReactionType[]): string {
  return [
    reactions.total,
    reactions.beenThere,
    reactions.helpful,
    reactions.respect,
    reactions.pain,
    reactions.saved,
    [...viewerReactions].sort().join(","),
  ].join("|");
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
  const meta = useMeta();
  const router = useRouter();
  const queryClient = useQueryClient();

  const sourceKey = reactionStateKey(reactions, viewerReactions);
  const [state, setState] = React.useState(() => ({
    sourceKey,
    summary: reactions,
    mine: new Set(viewerReactions),
  }));
  const [pending, setPending] = React.useState<Set<ReactionType>>(() => new Set());

  let current = state;
  if (state.sourceKey !== sourceKey && pending.size === 0) {
    current = { sourceKey, summary: reactions, mine: new Set(viewerReactions) };
    setState(current);
  }

  const { summary, mine } = current;

  async function toggle(type: ReactionType) {
    if (!user) {
      toast("Log in to react to this L.", {
        action: { label: "Log in", onClick: () => router.push("/login") },
      });
      return;
    }
    if (pending.has(type)) return;

    const willAdd = !mine.has(type);
    const key = COUNT_KEY[type];
    const prevState = current;
    const nextMine = new Set(mine);
    if (willAdd) nextMine.add(type);
    else nextMine.delete(type);

    const delta = willAdd ? 1 : -1;
    const nextSummary: ReactionsSummary = {
      ...summary,
      [key]: Math.max(0, summary[key] + delta),
    };
    if (type !== "SAVED") nextSummary.total = Math.max(0, summary.total + delta);

    setState({ ...current, summary: nextSummary, mine: nextMine });
    setPending((prev) => new Set(prev).add(type));

    try {
      const res = willAdd ? await addReaction(lId, type) : await removeReaction(lId, type);
      // Reconcile with the authoritative server response (contract §5).
      setState((prev) => ({
        ...prev,
        summary: res.reactions,
        mine: new Set(res.viewer.reactions),
      }));
      if (type === "SAVED") {
        void queryClient.invalidateQueries({ queryKey: ["saved"] });
      }
    } catch (err) {
      setState(prevState);
      toast.error(errorMessage(err, "Could not save your reaction."));
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
    }
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
        aria-label={`${commentCount} comments`}
      >
        <MessageCircle className="size-4" />
        {commentCount > 0 ? <span className="text-xs tabular-nums">{commentCount}</span> : null}
      </Link>

      <button
        type="button"
        onClick={() => toggle("SAVED")}
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
