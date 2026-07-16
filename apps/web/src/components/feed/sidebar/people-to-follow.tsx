"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { FeedSidebarResponse, SuggestedUser } from "@linkedout/contracts/v2";

import { errorMessage, follow } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { usePrincipal } from "@/components/session-provider";
import { statusOption, useMeta } from "@/components/meta-provider";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { SidebarSection } from "@/components/feed/sidebar/sidebar-section";

function SuggestionRow({
  suggestion,
  onFollow,
  pending,
}: {
  suggestion: SuggestedUser;
  onFollow: (username: string) => void;
  pending: boolean;
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
        <Link href={`/u/${user.username}`} className="block truncate text-sm font-medium hover:underline">
          {name}
        </Link>
        {/* Server-composed. Rendered verbatim — the frontend never infers why. */}
        <p className="text-muted-foreground truncate text-xs">{reason.text}</p>
      </div>

      {viewer.canFollow ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 rounded-full px-3 text-xs"
          aria-label={`Follow ${name}`}
          disabled={pending}
          onClick={() => onFollow(user.username)}
        >
          Follow
        </Button>
      ) : (
        // canFollow is false (a guest). Never fire the write it would reject — offer the
        // route to acquiring the permission instead.
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-7 shrink-0 rounded-full px-3 text-xs"
        >
          <Link href={`/login?returnTo=${encodeURIComponent("/")}`} aria-label={`Follow ${name}`}>
            Follow
          </Link>
        </Button>
      )}
    </div>
  );
}

export function PeopleToFollow({ items }: { items: SuggestedUser[] }) {
  const principal = usePrincipal();
  const queryClient = useQueryClient();
  const sidebarKey = queryKeys.feedSidebar.detail(principal);

  const mutation = useMutation({
    mutationFn: (username: string) => follow(username),
    onMutate: async (username) => {
      await queryClient.cancelQueries({ queryKey: sidebarKey, exact: true });
      const previous = queryClient.getQueryData<FeedSidebarResponse>(sidebarKey);
      // Somebody you now follow is no longer a suggestion. Drop the row immediately.
      queryClient.setQueryData<FeedSidebarResponse>(sidebarKey, (current) =>
        current
          ? {
              ...current,
              peopleToFollow: {
                ...current.peopleToFollow,
                items: current.peopleToFollow.items.filter(
                  (item) => item.user.username !== username,
                ),
              },
            }
          : current,
      );
      return { previous };
    },
    onError: (err, _username, context) => {
      if (context?.previous) queryClient.setQueryData(sidebarKey, context.previous);
      toast.error(errorMessage(err, "Could not follow that builder."));
    },
    onSuccess: () => {
      // Refetch so the backend can rank a replacement into the vacated slot. This is the
      // only thing that refreshes the rails — they never poll (see `feed-sidebar`).
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
              onFollow={(username) => mutation.mutate(username)}
              pending={mutation.isPending && mutation.variables === suggestion.user.username}
            />
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}
