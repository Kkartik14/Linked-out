"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PenLine, Search } from "lucide-react";

import { useViewer } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { HeaderSearch } from "@/components/search/header-search";
import { cn } from "@/lib/utils";

export function Header() {
  const user = useViewer();
  const pathname = usePathname();
  const isFeed = pathname === "/";
  const isSearch = pathname === "/search";

  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <Link
          href="/"
          aria-label="LinkedOut home"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="bg-foreground text-background grid size-6 place-items-center rounded-md text-sm font-bold">
            L
          </span>
          <span className="hidden sm:inline">
            Linked<span className="text-muted-foreground">Out</span>
          </span>
        </Link>

        {isSearch ? null : (
          <nav className="ml-2 hidden items-center gap-1 md:flex">
            <Link
              href="/"
              className={cn(
                "hover:bg-accent rounded-md px-3 py-1.5 text-sm transition-colors",
                isFeed ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              Feed
            </Link>
          </nav>
        )}

        <div className="flex flex-1 items-center justify-end gap-1.5">
          {isSearch ? null : <HeaderSearch />}

          {isSearch ? null : (
            <Button asChild variant="ghost" size="icon" className="sm:hidden">
              <Link href="/search?focus=1" aria-label="Search Ls and people">
                <Search className="size-4" />
              </Link>
            </Button>
          )}

          <Button asChild size="sm" className="gap-1.5">
            <Link href="/new">
              <PenLine className="size-4" />
              {/* `sr-only`, not `hidden`: below `sm` the label was display:none and the icon
                  is auto-`aria-hidden` by lucide, which left the primary CTA with no
                  accessible name at all. Staying in the tree keeps the name at every width
                  without an aria-label duplicating text that is visible anyway. */}
              <span className="sr-only sm:not-sr-only">Share an L</span>
            </Link>
          </Button>

          {user ? <NotificationsBell /> : null}
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
