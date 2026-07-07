"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { errorMessage, follow, unfollow } from "@/lib/api";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";

export function FollowButton({
  username,
  initialFollowing,
}: {
  username: string;
  initialFollowing: boolean;
}) {
  const { user } = useSession();
  const router = useRouter();
  const [following, setFollowing] = React.useState(initialFollowing);
  const [busy, setBusy] = React.useState(false);

  async function toggle() {
    if (!user) {
      router.push(`/login?returnTo=${encodeURIComponent(`/u/${username}`)}`);
      return;
    }
    if (busy) return;
    const prev = following;
    setFollowing(!prev);
    setBusy(true);
    try {
      const result = prev ? await unfollow(username) : await follow(username);
      setFollowing(result.isFollowing);
    } catch (err) {
      setFollowing(prev);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={following ? "outline" : "default"} onClick={toggle} disabled={busy}>
      {following ? "Following" : "Follow"}
    </Button>
  );
}
