"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { emailAddressSchema, emailOtpSchema, passwordSchema } from "@linkedout/contracts";

import { emailForgotPassword, emailResendOtp, emailResetPassword } from "@/lib/api";
import { emailAuthErrorMessage } from "@/lib/email-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OtpInput, OTP_LENGTH } from "@/components/auth/otp-input";
import { PasswordField } from "@/components/auth/password-field";
import { useResendCooldown } from "@/components/auth/use-resend-cooldown";

const PASSWORD_MIN = 15;

type Step = "request" | "reset" | "done";

/**
 * Forgot/reset password over the OTP challenge, in three steps on one screen.
 *
 * `request` is enumeration-safe: the API returns the same generic `202` for a known and an unknown
 * address, so this always advances to the code step. Reset does not sign the user in — the backend
 * revokes every session as part of the change — so the terminal step routes back to login rather
 * than establishing one, which is also the honest thing to show after a credential change.
 */
export function ForgotPasswordForm({ returnTo }: { returnTo: string }) {
  const [step, setStep] = React.useState<Step>("request");
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const cooldown = useResendCooldown();

  const loginHref =
    returnTo && returnTo !== "/" ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!emailAddressSchema.safeParse(email).success) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await emailForgotPassword({ email });
      setStep("reset");
    } catch (err) {
      setError(emailAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!emailOtpSchema.safeParse(otp).success) {
      setError(`Enter the ${OTP_LENGTH}-digit code from your email.`);
      return;
    }
    if (!passwordSchema.safeParse(password).success) {
      setError(`Use at least ${PASSWORD_MIN} characters for your new password.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await emailResetPassword({ email, otp, newPassword: password });
      setStep("done");
    } catch (err) {
      setError(emailAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    cooldown.start();
    try {
      await emailResendOtp({ email, purpose: "PASSWORD_RESET" });
      toast.success("If that account exists, we’ve sent a fresh code.");
    } catch (err) {
      toast.error(emailAuthErrorMessage(err));
    }
  }

  if (step === "request") {
    return (
      <form onSubmit={handleRequest} className="mt-6 flex flex-col gap-5" noValidate>
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

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={busy}>
          {busy ? "Sending code…" : "Send reset code"}
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          Remembered it?{" "}
          <Link href={loginHref} className="text-foreground underline-offset-4 hover:underline">
            Back to login
          </Link>
        </p>
      </form>
    );
  }

  if (step === "done") {
    return (
      <div className="mt-6 flex flex-col gap-5 text-center">
        <p className="text-sm">
          Your password has been updated. For your security we signed out every device, so you’ll
          need to log in again with your new password.
        </p>
        <Button asChild>
          <Link href={loginHref}>Continue to login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleReset} className="mt-6 flex flex-col gap-5" noValidate>
      <div className="grid gap-2">
        <span id="otp-label" className="text-sm font-medium">
          Reset code
        </span>
        <OtpInput
          value={otp}
          onChange={(next) => {
            setOtp(next);
            setError(null);
          }}
          disabled={busy}
          invalid={error !== null}
          autoFocus
          labelledBy="otp-label"
          describedBy="otp-hint"
        />
        <p id="otp-hint" className="text-muted-foreground text-xs">
          Enter the {OTP_LENGTH}-digit code we sent to{" "}
          <span className="text-foreground font-medium">{email}</span>. It expires in 10 minutes.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="new-password">New password</Label>
        <PasswordField
          id="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          placeholder="At least 15 characters"
          autoComplete="new-password"
          maxLength={128}
          aria-invalid={error !== null}
          aria-describedby="new-password-hint"
        />
        <p id="new-password-hint" className="text-muted-foreground text-xs">
          Use at least {PASSWORD_MIN} characters. A memorable passphrase works well.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={busy}>
        {busy ? "Updating…" : "Reset password"}
      </Button>

      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown.active || busy}
          className="hover:text-foreground underline-offset-4 hover:underline disabled:no-underline disabled:opacity-60"
        >
          {cooldown.active ? `Resend code in ${cooldown.remaining}s` : "Resend code"}
        </button>
        <Link href={loginHref} className="hover:text-foreground underline-offset-4 hover:underline">
          Back to login
        </Link>
      </div>
    </form>
  );
}
