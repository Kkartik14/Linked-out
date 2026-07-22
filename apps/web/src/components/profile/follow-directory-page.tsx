import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { getFollowers, getFollowing, getProfile } from "@/lib/api";
import { publicReadFailure, redirectIfCredentialRejected } from "@/lib/public-read";
import { FollowDirectory, type FollowDirectoryVariant } from "@/components/profile/follow-directory";

/** Shared by `generateMetadata` and the page so a visit issues one profile request, not two. */
const loadProfile = cache((username: string) => getProfile(username));

const HEADING: Record<FollowDirectoryVariant, string> = {
  followers: "Followers",
  following: "Following",
};

const FETCH_FIRST_PAGE = {
  followers: getFollowers,
  following: getFollowing,
} as const;

export async function followDirectoryMetadata(
  username: string,
  variant: FollowDirectoryVariant,
): Promise<Metadata> {
  try {
    const profile = await loadProfile(username);
    return { title: `${profile.name ?? profile.username} — ${HEADING[variant]}` };
  } catch {
    return { title: HEADING[variant] };
  }
}

/**
 * The `/u/[username]/followers` and `/following` pages are the same server component: load the
 * profile (for the header + 404) and server-render the first list page, differing only by variant.
 */
export async function FollowDirectoryPage({
  username,
  variant,
}: {
  username: string;
  variant: FollowDirectoryVariant;
}) {
  const returnTo = `/u/${username}/${variant}`;
  const [profile, initial] = await Promise.all([
    loadProfile(username).catch((err: unknown) => publicReadFailure(err, returnTo)),
    // The list itself is optional-auth: a rejected credential redirects, but an empty list must
    // still render its empty state rather than a login bounce.
    FETCH_FIRST_PAGE[variant](username).catch((err: unknown) => {
      redirectIfCredentialRejected(err, returnTo);
      return undefined;
    }),
  ]);
  const headingId = `${variant}-heading`;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link
        href={`/u/${profile.username}`}
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        ← {profile.name ?? `@${profile.username}`}
      </Link>
      <section aria-labelledby={headingId}>
        <h1 id={headingId} className="mt-1 mb-5 text-2xl font-semibold tracking-tight">
          {HEADING[variant]}
        </h1>
        <FollowDirectory username={profile.username} variant={variant} initial={initial} />
      </section>
    </div>
  );
}
