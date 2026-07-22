"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { UserProfile } from "@linkedout/contracts";

import { errorMessage, follow, unfollow } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import {
  assertComposedPrincipal,
  useComposedPrincipal,
  usePrincipal,
  useViewer,
} from "@/components/session-provider";
import { Button } from "@/components/ui/button";

/**
 * Row-local follow toggle for the follower/following directories.
 *
 * Each directory row owns its optimistic relationship state, so it intentionally remains visible
 * after unfollow and can be followed again immediately. The signed-in viewer's profile count is
 * shared across routes, however, so that cache is reconciled separately. A signed-out viewer is
 * sent to login with the directory as the return path.
 */
export function DirectoryFollowButton({
  username,
  initialFollowing,
}: {
  username: string;
  initialFollowing: boolean;
}) {
  const viewer = useViewer();
  const principal = usePrincipal();
  const composedAs = useComposedPrincipal();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState(initialFollowing);
  const viewerProfileKey = viewer
    ? queryKeys.profiles.detail(principal, viewer.username)
    : null;
  const sidebarKey = queryKeys.feedSidebar.detail(principal);

  const mutation = useMutation({
    mutationFn: (wasFollowing: boolean) =>
      wasFollowing
        ? unfollow(assertComposedPrincipal(composedAs), username)
        : follow(assertComposedPrincipal(composedAs), username),
    onMutate: (wasFollowing) => {
      setFollowing(!wasFollowing);
      if (!viewer || !viewerProfileKey) return;
      queryClient.setQueryData<UserProfile>(viewerProfileKey, (current) => {
        const profile = current ?? viewer;
        return {
          ...profile,
          counts: {
            ...profile.counts,
            following: Math.max(0, profile.counts.following + (wasFollowing ? -1 : 1)),
          },
        };
      });
    },
    onError: (err, wasFollowing) => {
      setFollowing(wasFollowing);
      if (viewerProfileKey) {
        queryClient.setQueryData<UserProfile>(viewerProfileKey, (current) =>
          current
            ? {
                ...current,
                counts: {
                  ...current.counts,
                  following: Math.max(
                    0,
                    current.counts.following + (wasFollowing ? 1 : -1),
                  ),
                },
              }
            : current,
        );
      }
      toast.error(errorMessage(err));
    },
    onSuccess: (result) => setFollowing(result.isFollowing),
    onSettled: () => {
      if (viewerProfileKey) {
        void queryClient.invalidateQueries({ queryKey: viewerProfileKey, exact: true });
      }
      void queryClient.invalidateQueries({ queryKey: sidebarKey, exact: true });
    },
  });

  function toggle() {
    if (!viewer) {
      router.push(`/login?returnTo=${encodeURIComponent(pathname)}`);
      return;
    }
    if (mutation.isPending) return;
    mutation.mutate(following);
  }

  return (
    <Button
      variant={following ? "outline" : "default"}
      size="sm"
      onClick={toggle}
      disabled={mutation.isPending}
      aria-pressed={following}
    >
      {following ? "Following" : "Follow"}
    </Button>
  );
}
