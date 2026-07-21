"use client";

import * as React from "react";
import Link from "next/link";
import { emailAddressSchema } from "@linkedout/contracts";

import { emailLogin } from "@/lib/api";
import { completeEmailSession, emailAuthErrorMessage } from "@/lib/email-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/auth/password-field";

/**
 * Email/password login. On success the API returns the same one-time handoff OAuth does, which
 * {@link completeEmailSession} exchanges for the session cookie.
 *
 * Wrong password and unknown account both surface as one `INVALID_CREDENTIALS` message — the
 * backend refuses to distinguish them and neither does this form, so login is not an account oracle.
 * An unverified sign-up also lands here: it reads as "incorrect", and the fix is to finish signing
 * up, which the link below offers.
 */
export function LoginForm({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const forgotHref =
    returnTo && returnTo !== "/"
      ? `/forgot-password?returnTo=${encodeURIComponent(returnTo)}`
      : "/forgot-password";
  const signupHref =
    returnTo && returnTo !== "/"
      ? `/signup?returnTo=${encodeURIComponent(returnTo)}`
      : "/signup";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailAddressSchema.safeParse(email).success) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length === 0) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const handoff = await emailLogin({ email, password, returnTo });
      // Navigates away; keep the form inert until the session boundary takes over.
      completeEmailSession(handoff.code);
    } catch (err) {
      setError(emailAuthErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          placeholder="you@example.com"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoFocus
          aria-invalid={error !== null}
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href={forgotHref}
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordField
          id="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          placeholder="Your password"
          autoComplete="current-password"
          maxLength={128}
          aria-invalid={error !== null}
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Log in"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        New to LinkedOut?{" "}
        <Link href={signupHref} className="text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
