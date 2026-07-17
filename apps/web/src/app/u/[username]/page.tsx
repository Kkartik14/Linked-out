import { cache } from "react";
import type { Metadata } from "next";

import { getJourney, getProfile } from "@/lib/api";
import { publicReadFailure, redirectIfCredentialRejected } from "@/lib/public-read";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileTabs } from "@/components/profile/profile-tabs";

const loadProfile = cache((username: string) => getProfile(username));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  try {
    const p = await loadProfile(username);
    return {
      title: `${p.name ?? p.username} (@${p.username})`,
      description: p.bio ?? `@${p.username} on LinkedOut`,
    };
  } catch {
    return { title: "Profile" };
  }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  // Both take `username` from the route, so neither waits on the other — awaiting them in
  // sequence would bill every profile view for a round trip it doesn't need.
  const [profile, journeyInitial] = await Promise.all([
    loadProfile(username).catch((err: unknown) => publicReadFailure(err, `/u/${username}`)),
    // The journey is a section of this page, not an independently-failing rail: a rejected
    // credential must not become an empty timeline (contract v2 §2 — a bad credential is
    // never silently a guest). Only a genuinely absent journey renders as undefined.
    getJourney(username).catch((err: unknown) => {
      redirectIfCredentialRejected(err, `/u/${username}`);
      return undefined;
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <ProfileHeader profile={profile} />
      <ProfileTabs
        username={profile.username}
        journeyInitial={journeyInitial}
        isSelf={profile.viewer.isSelf}
      />
    </div>
  );
}
