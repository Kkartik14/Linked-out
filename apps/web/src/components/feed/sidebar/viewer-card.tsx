"use client";

import Link from "next/link";
import type {
  FeedSidebarViewer,
  MetaEnumsResponse,
  Reputation,
  UserProfile,
} from "@linkedout/contracts";

import { statusOption, useMeta } from "@/components/meta-provider";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { SidebarSection } from "@/components/feed/sidebar/sidebar-section";
import { compactNumber } from "@/lib/format";

/** The compact profile card leads with contribution rather than follower counts. */
const HEADLINE_REPUTATION: readonly (keyof Reputation)[] = ["lsShared"];

/** `{n} {label}`, composed from raw counts plus /meta/enums labels (contract §3). */
function reputationStats(meta: MetaEnumsResponse, reputation: Reputation) {
  return HEADLINE_REPUTATION.flatMap((key) => {
    const label = meta.reputation.find((entry) => entry.key === key)?.label;
    return label ? [{ key, label, value: reputation[key] }] : [];
  });
}

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
  const stats = reputationStats(meta, profile.reputation);

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

      {stats.length > 0 ? (
        <dl className="grid grid-cols-1 border-t">
          {stats.map((stat) => (
            <div key={stat.key} className="px-3 py-2.5 text-center">
              <dt className="text-muted-foreground text-[11px] leading-tight">{stat.label}</dt>
              <dd className="text-sm font-semibold tabular-nums">{compactNumber(stat.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="border-t p-2">
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link href={`/u/${profile.username}`}>View profile</Link>
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
