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
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="yourname"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={30}
            aria-invalid={username.length > 0 && !valid}
            aria-describedby={error ? "username-error" : undefined}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          This is your handle on LinkedOut. It can&apos;t be changed easily later.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="name">Display name (optional)</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Your name"
        />
      </div>

      {error ? (
        <p id="username-error" role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={busy || !valid}>
        {busy ? "Setting up…" : "Continue"}
      </Button>
    </form>
  );
}
