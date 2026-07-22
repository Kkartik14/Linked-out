"use client";

import Link from "next/link";
import type { FeedSidebarViewer, UserProfile } from "@linkedout/contracts";

import { statusOption, useMeta } from "@/components/meta-provider";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { SidebarSection } from "@/components/feed/sidebar/sidebar-section";
import { compactNumber } from "@/lib/format";

function Prompt({
  title,
  body,
  action,
  href,
}: {
  title: string;
  body: string;
  action: string;
  href: string;
}) {
  return (
    <SidebarSection title={title}>
      <div className="px-4 pb-4">
        <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
        <Button asChild size="sm" className="mt-3 w-full">
          <Link href={href}>{action}</Link>
        </Button>
      </div>
    </SidebarSection>
  );
}

function SignedInCard({ profile }: { profile: UserProfile }) {
  const meta = useMeta();
  const status = statusOption(meta, profile.status);
  const lsSharedLabel =
    meta.reputation.find((entry) => entry.key === "lsShared")?.label ?? "Ls Shared";
  const profileHref = `/u/${profile.username}`;
  const metricLinkClass =
    "hover:text-foreground focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-[3px]";

  return (
    <SidebarSection label="Your profile">
      <div className="flex flex-col items-center px-4 pt-5 pb-4 text-center">
        <UserAvatar
          name={profile.name}
          username={profile.username}
          image={profile.image}
          statusDot={status?.dot}
          className="size-14 text-base"
        />
        <p className="mt-3 leading-tight font-medium">{profile.name ?? profile.username}</p>
        <p className="text-muted-foreground text-xs">@{profile.username}</p>
        {status ? (
          <p className="text-muted-foreground mt-2 text-xs">
            <span aria-hidden>{status.dot}</span> {status.label}
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-3 border-t">
        <div className="min-w-0 px-2 py-2.5 text-center">
          <dt className="text-muted-foreground text-[11px] leading-tight">{lsSharedLabel}</dt>
          <dd className="text-sm font-semibold tabular-nums">
            {compactNumber(profile.reputation.lsShared)}
          </dd>
        </div>
        <div className="min-w-0 border-l px-2 py-2.5 text-center">
          <dt className="text-muted-foreground text-[11px] leading-tight">
            <Link href={`${profileHref}/followers`} className={metricLinkClass}>
              Followers
            </Link>
          </dt>
          <dd className="text-sm font-semibold tabular-nums">
            {compactNumber(profile.counts.followers)}
          </dd>
        </div>
        <div className="min-w-0 border-l px-2 py-2.5 text-center">
          <dt className="text-muted-foreground text-[11px] leading-tight">
            <Link href={`${profileHref}/following`} className={metricLinkClass}>
              Following
            </Link>
          </dt>
          <dd className="text-sm font-semibold tabular-nums">
            {compactNumber(profile.counts.following)}
          </dd>
        </div>
      </dl>

      <div className="border-t p-2">
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link href={profileHref}>View profile</Link>
        </Button>
      </div>
    </SidebarSection>
  );
}

/**
 * One card per viewer state, chosen exhaustively.
 *
 * `switch` rather than a pair of `if`s with a trailing fallback: the fallback made
 * `SignedInCard` the answer to "anything else", so a fourth state added to the contract's
 * union would have rendered a profile card for a viewer who has no profile. The `never`
 * assignment below turns that into a compile error instead.
 */
export function ViewerCard({ viewer }: { viewer: FeedSidebarViewer }) {
  switch (viewer.state) {
    case "SIGNED_OUT":
      return (
        <Prompt
          title="Join LinkedOut"
          body="LinkedIn for your Ls. Share the rejections, the layoffs, the pivots — and what they taught you."
          action="Log in"
          href="/login"
        />
      );
    case "ONBOARDING_REQUIRED":
      return (
        <Prompt
          title="Finish your profile"
          body="Pick a username so other builders can find your journey."
          action="Finish setup"
          href="/onboarding"
        />
      );
    case "READY":
      return <SignedInCard profile={viewer.profile} />;
    default: {
      const _exhaustive: never = viewer;
      return _exhaustive;
    }
  }
}
