"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { UserProfile } from "@linkedout/contracts/v2";

import { errorMessage, follow, unfollow } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { usePrincipal, useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";

export function FollowButton({
  username,
  following,
}: {
  username: string;
  following: boolean;
}) {
  const { user } = useSession();
  const principal = usePrincipal();
  const router = useRouter();
  const queryClient = useQueryClient();
  const profileKey = queryKeys.profiles.detail(principal, username);

  const mutation = useMutation({
    mutationKey: [...profileKey, "follow"] as const,
    mutationFn: (wasFollowing: boolean) =>
      wasFollowing ? unfollow(username) : follow(username),
    onMutate: async (wasFollowing) => {
      await queryClient.cancelQueries({ queryKey: profileKey, exact: true });
      const previous = queryClient.getQueryData<UserProfile>(profileKey);
      queryClient.setQueryData<UserProfile>(profileKey, (current) =>
        current
          ? {
              ...current,
              counts: {
                ...current.counts,
                followers: Math.max(0, current.counts.followers + (wasFollowing ? -1 : 1)),
              },
              viewer: { ...current.viewer, isFollowing: !wasFollowing },
            }
          : current,
      );
      return { previous };
    },
    onError: (err, _wasFollowing, context) => {
      if (context?.previous) queryClient.setQueryData(profileKey, context.previous);
      toast.error(errorMessage(err));
    },
    onSuccess: (result) => {
      queryClient.setQueryData<UserProfile>(profileKey, (current) =>
        current
          ? {
              ...current,
              counts: result.counts,
              viewer: { ...current.viewer, isFollowing: result.isFollowing },
            }
          : current,
      );
    },
  });

  function toggle() {
    if (!user) {
      router.push(`/login?returnTo=${encodeURIComponent(`/u/${username}`)}`);
      return;
    }
    if (mutation.isPending) return;
    mutation.mutate(following);
  }

  return (
    <Button
      variant={following ? "outline" : "default"}
      onClick={toggle}
      disabled={mutation.isPending}
    >
      {following ? "Following" : "Follow"}
    </Button>
  );
}
