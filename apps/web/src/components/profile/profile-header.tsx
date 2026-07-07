"use client";

import Link from "next/link";
import type { Reputation, UserProfile } from "@linkedout/contracts";

import { statusOption, useMeta } from "@/components/meta-provider";
import { UserAvatar } from "@/components/user-avatar";
import { FollowButton } from "@/components/profile/follow-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { compactNumber } from "@/lib/format";

export function ProfileHeader({ profile }: { profile: UserProfile }) {
  const meta = useMeta();
  const status = statusOption(meta, profile.status);

  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <UserAvatar
          name={profile.name}
          username={profile.username}
          image={profile.image}
          statusDot={status?.dot}
          className="size-16 text-lg"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {profile.name ?? profile.username}
          </h1>
          <p className="text-muted-foreground text-sm">@{profile.username}</p>
          {status ? (
            <Badge variant="secondary" className="mt-1.5 gap-1">
              <span aria-hidden>{status.dot}</span>
              {status.label}
            </Badge>
          ) : null}
        </div>
        <div className="shrink-0">
          {profile.viewer.isSelf ? (
            <Button asChild variant="outline">
              <Link href="/settings">Edit profile</Link>
            </Button>
          ) : (
            <FollowButton username={profile.username} initialFollowing={profile.viewer.isFollowing} />
          )}
        </div>
      </div>

      {profile.bio ? <p className="text-[15px] leading-relaxed">{profile.bio}</p> : null}

      <p className="text-muted-foreground text-sm">
        <span className="text-foreground font-medium">{compactNumber(profile.counts.followers)}</span>{" "}
        followers ·{" "}
        <span className="text-foreground font-medium">{compactNumber(profile.counts.following)}</span>{" "}
        following
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border p-3 text-sm">
        {meta.reputation.map((r) => (
          <div key={r.key}>
            <span className="font-semibold">
              {compactNumber(profile.reputation[r.key as keyof Reputation])}
            </span>{" "}
            <span className="text-muted-foreground">{r.label}</span>
          </div>
        ))}
      </div>
    </header>
  );
}
