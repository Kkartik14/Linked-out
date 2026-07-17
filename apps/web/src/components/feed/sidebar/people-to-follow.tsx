"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  FeedSidebarResponse,
  FeedSidebarViewer,
  SuggestedUser,
} from "@linkedout/contracts/v2";

import { errorMessage, follow } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { usePrincipal } from "@/components/session-provider";
import { statusOption, useMeta } from "@/components/meta-provider";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { SidebarSection } from "@/components/feed/sidebar/sidebar-section";

/**
 * Where a row sends a viewer who cannot follow yet, or `null` when the union says there is
 * nowhere to send them.
 *
 * `canFollow: false` does not mean "guest". `personalized` is true only for `READY`
 * (contract §2), so `SIGNED_OUT` and `ONBOARDING_REQUIRED` both arrive here with the flag
 * false — and an onboarding viewer is already authenticated, so /login is a dead end for
 * them. Only `viewer.state` tells the two apart; the flag never does. This chooses a
 * destination and nothing else: the permission itself is still read from `viewer.canFollow`.
 */
function permissionRoute(viewer: FeedSidebarViewer): string | null {
  switch (viewer.state) {
    case "SIGNED_OUT":
      return `/login?returnTo=${encodeURIComponent("/")}`;
    case "ONBOARDING_REQUIRED":
      return "/onboarding";
    case "READY":
      // Authenticated and onboarded. The backend withheld this one suggestion's
      // permission; no route the frontend knows would grant it, so don't invent one.
      return null;
    default: {
      const _exhaustive: never = viewer;
      return _exhaustive;
    }
  }
}

function SuggestionRow({
  suggestion,
  followHref,
  onFollow,
}: {
  suggestion: SuggestedUser;
  followHref: string | null;
  onFollow: (username: string) => void;
}) {
  const meta = useMeta();
  const { user, reason, viewer } = suggestion;
  const status = statusOption(meta, user.status);
  const name = user.name ?? user.username;

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5">
      <Link href={`/u/${user.username}`} tabIndex={-1} aria-hidden>
        <UserAvatar
          name={user.name}
          username={user.username}
          image={user.image}
          statusDot={status?.dot}
          className="size-9"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={`/u/${user.username}`}
          className="block truncate text-sm leading-tight font-medium hover:underline"
        >
          {name}
        </Link>
        {/*
         * Server-composed, rendered verbatim — the frontend never infers why someone is
         * suggested. Its length is the backend's choice, so wrap to two lines rather than
         * truncating: "Active builder this week" clipped to "Active builder this …" reads
         * like a bug, and a rail this narrow clips more copy than it keeps.
         */}
        <p className="text-muted-foreground line-clamp-2 text-xs leading-snug">{reason.text}</p>
      </div>

      {viewer.canFollow ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 rounded-full px-3 text-xs"
          aria-label={`Follow ${name}`}
          onClick={() => onFollow(user.username)}
        >
          Follow
        </Button>
      ) : followHref ? (
        // The backend says this viewer cannot follow. Never fire the write it would
        // reject — offer the route to acquiring the permission instead.
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-7 shrink-0 rounded-full px-3 text-xs"
        >
          <Link href={followHref} aria-label={`Follow ${name}`}>
            Follow
          </Link>
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 rounded-full px-3 text-xs"
          aria-label={`Follow ${name}`}
          disabled
        >
          Follow
        </Button>
      )}
    </div>
  );
}

export function PeopleToFollow({
  items,
  viewer,
}: {
  items: SuggestedUser[];
  viewer: FeedSidebarViewer;
}) {
  const principal = usePrincipal();
  const queryClient = useQueryClient();
  const sidebarKey = queryKeys.feedSidebar.detail(principal);
  const followHref = permissionRoute(viewer);

  const mutation = useMutation({
    mutationFn: (username: string) => follow(username),
    onMutate: async (username) => {
      await queryClient.cancelQueries({ queryKey: sidebarKey, exact: true });
      const current = queryClient.getQueryData<FeedSidebarResponse>(sidebarKey);
      // Remember only this row and the slot it occupied, never a whole-list snapshot —
      // see `onError`.
      const index =
        current?.peopleToFollow.items.findIndex((item) => item.user.username === username) ?? -1;
      const removed = index >= 0 ? current?.peopleToFollow.items[index] : undefined;

      // Somebody you now follow is no longer a suggestion. Drop the row immediately.
      queryClient.setQueryData<FeedSidebarResponse>(sidebarKey, (data) =>
        data
          ? {
              ...data,
              peopleToFollow: {
                ...data.peopleToFollow,
                items: data.peopleToFollow.items.filter(
                  (item) => item.user.username !== username,
                ),
              },
            }
          : data,
      );

      return { removed, index };
    },
    onError: (err, _username, context) => {
      // Surgical, because one mutation serves every row and rows overlap in flight.
      // Restoring the list this row snapshotted would write back builders the *other*
      // in-flight follows had already removed: follow A then B, A fails, and B — whom you
      // now genuinely follow — reappears in the rail. Re-insert only the row that failed,
      // into the slot the backend gave it. The order stays the backend's; nothing re-sorts.
      const removed = context?.removed;
      const index = context?.index ?? -1;
      if (removed && index >= 0) {
        queryClient.setQueryData<FeedSidebarResponse>(sidebarKey, (data) => {
          if (!data) return data;
          const current = data.peopleToFollow.items;
          // A refetch may have already put them back; don't duplicate the row.
          if (current.some((item) => item.user.id === removed.user.id)) return data;
          const at = Math.min(index, current.length);
          return {
            ...data,
            peopleToFollow: {
              ...data.peopleToFollow,
              items: [...current.slice(0, at), removed, ...current.slice(at)],
            },
          };
        });
      }
      toast.error(errorMessage(err, "Could not follow that builder."));
    },
    onSettled: () => {
      // Every path reconciles against the server: on success the backend ranks a
      // replacement into the vacated slot, and on failure this confirms what the rollback
      // above reconstructed. The rails never poll (see `feed-sidebar`), so a follow is the
      // only thing that refreshes them.
      void queryClient.invalidateQueries({ queryKey: sidebarKey, exact: true });
    },
  });

  // The backend decides who is eligible; nothing to suggest means nothing to show.
  if (items.length === 0) return null;

  return (
    <SidebarSection title="People to follow">
      <ul className="divide-border/60 divide-y border-t">
        {items.map((suggestion) => (
          <li key={suggestion.user.id}>
            <SuggestionRow
              suggestion={suggestion}
              followHref={followHref}
              onFollow={(username) => mutation.mutate(username)}
            />
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}
