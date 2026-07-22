import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { getFollowing, getProfile } from "@/lib/api";
import { publicReadFailure, redirectIfCredentialRejected } from "@/lib/public-read";
import { FollowDirectory } from "@/components/profile/follow-directory";

const loadProfile = cache((username: string) => getProfile(username));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  try {
    const profile = await loadProfile(username);
    return { title: `${profile.name ?? profile.username} — Following` };
  } catch {
    return { title: "Following" };
  }
}

export default async function FollowingPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const returnTo = `/u/${username}/following`;
  const [profile, initial] = await Promise.all([
    loadProfile(username).catch((err: unknown) => publicReadFailure(err, returnTo)),
    // The list itself is optional-auth: a rejected credential redirects, but an empty list must
    // still render its empty state rather than a login bounce.
    getFollowing(username).catch((err: unknown) => {
      redirectIfCredentialRejected(err, returnTo);
      return undefined;
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link
        href={`/u/${profile.username}`}
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        ← {profile.name ?? `@${profile.username}`}
      </Link>
      <h1 id="following-heading" className="mt-1 mb-5 text-2xl font-semibold tracking-tight">
        Following
      </h1>
      <FollowDirectory username={profile.username} variant="following" initial={initial} />
    </div>
  );
}
