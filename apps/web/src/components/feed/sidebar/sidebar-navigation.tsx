"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Search } from "lucide-react";

import { SidebarSection } from "@/components/feed/sidebar/sidebar-section";
import { useSession } from "@/components/session-provider";
import { cn } from "@/lib/utils";

const ITEM =
  "focus-visible:ring-ring/50 hover:bg-accent flex min-h-10 items-center gap-3 rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-[3px]";

export function SidebarNavigation() {
  const pathname = usePathname();
  const session = useSession();
  const savedHref =
    session.status === "guest" || session.status === "rejected"
      ? "/login?returnTo=%2Fsaved"
      : "/saved";

  return (
    <SidebarSection label="Explore" className="p-1.5">
      <nav aria-label="Explore">
        <ul>
          <li>
            <Link
              href="/search?focus=1"
              aria-current={pathname === "/search" ? "page" : undefined}
              className={cn(ITEM, pathname === "/search" && "bg-accent font-medium")}
            >
              <Search aria-hidden className="size-4" />
              Search
            </Link>
          </li>
          <li>
            <Link
              href={savedHref}
              aria-current={pathname === "/saved" ? "page" : undefined}
              className={cn(ITEM, pathname === "/saved" && "bg-accent font-medium")}
            >
              <Bookmark aria-hidden className="size-4" />
              Saved
            </Link>
          </li>
        </ul>
      </nav>
    </SidebarSection>
  );
}
