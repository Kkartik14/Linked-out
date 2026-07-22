import type { Metadata } from "next";

import {
  FollowDirectoryPage,
  followDirectoryMetadata,
} from "@/components/profile/follow-directory-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return followDirectoryMetadata(username, "followers");
}

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <FollowDirectoryPage username={username} variant="followers" />;
}
