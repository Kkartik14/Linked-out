import { cache } from "react";
import type { Metadata } from "next";

import { getProfile } from "@/lib/api";
import { publicReadFailure } from "@/lib/public-read";
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

  const profile = await loadProfile(username).catch((err: unknown) =>
    publicReadFailure(err, `/u/${username}`),
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <ProfileHeader profile={profile} />
      <ProfileTabs username={profile.username} isSelf={profile.viewer.isSelf} />
    </div>
  );
}
