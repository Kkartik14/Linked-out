"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PenLine, Search } from "lucide-react";

import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { cn } from "@/lib/utils";

function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const query = q.trim();
        if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
      }}
      className="relative hidden sm:block"
    >
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search Ls, people…"
        aria-label="Search"
        className="border-input bg-muted/50 focus-visible:ring-ring/50 h-9 w-44 rounded-md border py-1 pr-3 pl-8 text-sm outline-none focus-visible:ring-[3px] focus-visible:bg-background md:w-56"
      />
    </form>
  );
}

export function Header() {
  const { user } = useSession();
  const pathname = usePathname();
  const isFeed = pathname === "/";

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

        <div className="flex flex-1 items-center justify-end gap-1.5">
          <HeaderSearch />

          <Button asChild size="sm" className="gap-1.5">
            <Link href="/new">
              <PenLine className="size-4" />
              <span className="hidden sm:inline">Share an L</span>
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
