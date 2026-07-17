"use client";

import Link from "next/link";
import type { UserSummary } from "@linkedout/contracts/v2";

import { statusOption, useMeta } from "@/components/meta-provider";
import { UserAvatar } from "@/components/user-avatar";

export function UserSummaryCard({ user }: { user: UserSummary }) {
  const meta = useMeta();
  const status = statusOption(meta, user.status);

  return (
    <Link
      href={`/u/${user.username}`}
      className="hover:bg-accent/50 flex items-center gap-3 rounded-lg border p-3 transition-colors"
    >
      <UserAvatar
        name={user.name}
        username={user.username}
        image={user.image}
        statusDot={status?.dot}
        className="size-10"
      />
      <div className="min-w-0">
        <p className="truncate font-medium">{user.name ?? user.username}</p>
        <p className="text-muted-foreground truncate text-sm">
          @{user.username}
          {status ? ` · ${status.label}` : ""}
        </p>
      </div>
    </Link>
  );
}
