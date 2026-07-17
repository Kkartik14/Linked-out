"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usernameInputSchema } from "@linkedout/contracts/v2";

import { errorMessage, isApiError, patchMe } from "@/lib/api";
import { useComposedPrincipal } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnboardingForm({
  returnTo,
  defaultName,
}: {
  returnTo: string;
  defaultName: string;
}) {
  const router = useRouter();
  const composedAs = useComposedPrincipal();
  const [username, setUsername] = React.useState("");
  const [name, setName] = React.useState(defaultName);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const valid = usernameInputSchema.safeParse(username).success;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError("3–30 characters: lowercase letters, numbers, and underscores.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchMe(composedAs, { username, name: name.trim() || null });
      toast.success("You're all set.");
      router.replace(returnTo);
      router.refresh();
    } catch (err) {
      if (isApiError(err) && err.code === "USERNAME_TAKEN") {
        setError("That username is already taken.");
      } else if (isApiError(err) && err.code === "USERNAME_INVALID") {
        setError("That username isn't valid. Use lowercase letters, numbers, and underscores.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
      <div className="grid gap-2">
        <Label htmlFor="username">Username</Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">@</span>
          <Input
            id="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase());
              setError(null);
            }}
            placeholder="yourname"
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={30}
            // Invalid once a submit has said so, not while the field is half-typed: every
            // username is invalid at one character, and announcing that is just noise.
            aria-invalid={error !== null}
            aria-describedby={error ? "username-hint username-error" : "username-hint"}
          />
        </div>
        {/* The rule lives here, visible and always linked. It used to exist only inside the
            unreachable branch below, so the one thing that could explain a rejected username
            was the one thing nobody could ever see. */}
        <p id="username-hint" className="text-muted-foreground text-xs">
          3–30 characters: lowercase letters, numbers, and underscores. This is your handle on
          LinkedOut and can&apos;t be changed easily later.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="name">Display name (optional)</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="name"
          placeholder="Your name"
        />
      </div>

      {error ? (
        <p id="username-error" role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {/* Gated on `busy` alone. Gating on validity too made `handleSubmit`'s own
          `if (!valid)` branch unreachable — a disabled default button suppresses implicit
          submission as well, so Enter could not reach it either. The result was a dead
          button and total silence about why, which fails everyone, not only AT users. */}
      <Button type="submit" disabled={busy}>
        {busy ? "Setting up…" : "Continue"}
      </Button>
    </form>
  );
}
