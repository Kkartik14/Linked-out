"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { errorMessage, follow, unfollow } from "@/lib/api";
import {
  assertComposedPrincipal,
  useComposedPrincipal,
  useViewer,
} from "@/components/session-provider";
import { Button } from "@/components/ui/button";

/**
 * Row-local follow toggle for the follower/following directories.
 *
 * Unlike the profile `FollowButton` (which reconciles the profile-detail cache), each directory
 * row owns its own optimistic state — the list response already told us the viewer's relationship
 * per row, so there is no shared cache entry to keep in sync. A signed-out viewer is sent to login
 * with the directory as the return path.
 */
export function DirectoryFollowButton({
  username,
  initialFollowing,
}: {
  username: string;
  initialFollowing: boolean;
}) {
  const viewer = useViewer();
  const composedAs = useComposedPrincipal();
  const router = useRouter();
  const pathname = usePathname();
  const [following, setFollowing] = useState(initialFollowing);

  const mutation = useMutation({
    mutationFn: (wasFollowing: boolean) =>
      wasFollowing
        ? unfollow(assertComposedPrincipal(composedAs), username)
        : follow(assertComposedPrincipal(composedAs), username),
    onMutate: (wasFollowing) => setFollowing(!wasFollowing),
    onError: (err, wasFollowing) => {
      setFollowing(wasFollowing);
      toast.error(errorMessage(err));
    },
    onSuccess: (result) => setFollowing(result.isFollowing),
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
