"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, LogOut, Settings, User } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { logout } from "@/lib/api";
import { publishSessionChanged } from "@/lib/session-channel";
import { assertComposedPrincipal, useComposedPrincipal, useSession } from "@/components/session-provider";
import { useMeta, statusOption } from "@/components/meta-provider";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const session = useSession();
  const meta = useMeta();
  const router = useRouter();
  const composedAs = useComposedPrincipal();

  const signOut = useMutation({
    mutationFn: () => logout(assertComposedPrincipal(composedAs)),
    onSuccess: () => {
      toast.success("Signed out.");
      // The session cookies are gone for every tab, not just this one.
      publishSessionChanged();
      router.refresh();
    },
    onError: () => toast.error("Could not sign out. Try again."),
  });

  if (session.status !== "authenticated") {
    // A guest — or a rejected credential, which likewise needs sign-in — is offered "Log in".
    // An `unavailable` session renders nothing at all: showing "Log in" would claim they are
    // signed out when the truth is only that we could not confirm the session, and a bare
    // header is the honest way to say "we don't know yet".
    return session.status === "guest" || session.status === "rejected" ? (
      <Button asChild size="sm">
        <Link href="/login">Log in</Link>
      </Button>
    ) : null;
  }

  const user = session.user;
  const status = statusOption(meta, user.status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-label="Account menu"
        >
          <UserAvatar
            name={user.name}
            username={user.username}
            image={user.image}
            statusDot={status?.dot}
            className="size-8"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-medium">{user.name ?? user.username}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">
            @{user.username}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={`/u/${user.username}`}>
              <User />
              Your profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/saved">
              <Bookmark />
              Saved
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => signOut.mutate()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
