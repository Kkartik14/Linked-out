"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  emailAddressSchema,
  emailOtpSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
} from "@linkedout/contracts";

import { emailResendOtp, emailSignup, emailVerify, isApiError } from "@/lib/api";
import { completeEmailSession, emailAuthErrorMessage } from "@/lib/email-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OtpInput, OTP_LENGTH } from "@/components/auth/otp-input";
import { PasswordField } from "@/components/auth/password-field";
import { PasswordStrength } from "@/components/auth/password-strength";
import { useResendCooldown } from "@/components/auth/use-resend-cooldown";

type Step = "credentials" | "otp";

/**
 * Email/password sign-up in two steps on one screen: choose credentials, then verify the emailed
 * code. Keeping both steps in a single client component lets the email *and* the password survive
 * the transition in local state.
 *
 * The password is deliberately **not** sent at signup — signup carries only the email and starts
 * verification. The credential is authored at `/verify`, submitted together with the code, so it
 * reaches the server only with proof of inbox control. This is the account pre-hijacking defence
 * (contract §0.1): a password seeded at signup could be silently committed by a victim's later
 * verification. We still collect it here for a one-screen experience, but hold it until verify.
 *
 * The whole flow is account-enumeration safe by construction: `signup` answers the same generic
 * `202` whether or not the address is already registered, so this screen advances to the code step
 * regardless and never reveals which happened.
 */
export function SignupForm({ returnTo }: { returnTo: string }) {
  const [step, setStep] = React.useState<Step>("credentials");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const cooldown = useResendCooldown();

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!emailAddressSchema.safeParse(email).success) {
      setError("Enter a valid email address.");
      return;
    }
    if (!passwordSchema.safeParse(password).success) {
      setError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Email only — the password is held locally and authored at verify (see the component note).
      await emailSignup({ email });
      setStep("otp");
    } catch (err) {
      setError(emailAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(codeOverride?: string) {
    const code = codeOverride ?? otp;
    if (!emailOtpSchema.safeParse(code).success) {
      setError(`Enter the ${OTP_LENGTH}-digit code from your email.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Author the credential now, with the code — the password reaches the server only alongside
      // proof of inbox control.
      const handoff = await emailVerify({ email, otp: code, password, returnTo });
      // Navigates away and establishes the session; keep `busy` so the form stays inert until then.
      completeEmailSession(handoff.code);
    } catch (err) {
      setError(emailAuthErrorMessage(err));
      if (isApiError(err) && err.code === "PASSWORD_COMPROMISED") setStep("credentials");
      setBusy(false);
    }
  }

  async function handleResend() {
    cooldown.start();
    try {
      await emailResendOtp({ email, purpose: "SIGNUP" });
      toast.success("If your address still needs a code, we’ve sent it again.");
    } catch (err) {
      toast.error(emailAuthErrorMessage(err));
    }
  }

  if (step === "credentials") {
    return (
      <form onSubmit={handleRequestCode} className="mt-6 flex flex-col gap-5" noValidate>
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
          <Label htmlFor="password">Password</Label>
          <PasswordField
            id="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            aria-invalid={error !== null}
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-muted-foreground text-xs">
            Use at least {PASSWORD_MIN_LENGTH} characters. Longer, unique passwords are stronger;
            uppercase letters, numbers, and symbols are optional.
          </p>
          <PasswordStrength password={password} />
        </div>

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={busy}>
          {busy ? "Sending code…" : "Create account"}
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleVerify();
      }}
      className="mt-6 flex flex-col gap-5"
      noValidate
    >
      <div className="grid gap-2">
        <span id="otp-label" className="text-sm font-medium">
          Verification code
        </span>
        <OtpInput
          value={otp}
          onChange={(next) => {
            setOtp(next);
            setError(null);
          }}
          onComplete={(next) => void handleVerify(next)}
          disabled={busy}
          invalid={error !== null}
          autoFocus
          labelledBy="otp-label"
          describedBy={error ? "otp-hint otp-error" : "otp-hint"}
        />
        <p id="otp-hint" className="text-muted-foreground text-xs">
          Enter the {OTP_LENGTH}-digit code we sent to{" "}
          <span className="text-foreground font-medium">{email}</span>. It expires in 10 minutes.
        </p>
      </div>

      {error ? (
        <p id="otp-error" role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={busy || otp.length < OTP_LENGTH}>
        {busy ? "Verifying…" : "Verify and continue"}
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
        <button
          type="button"
          onClick={() => {
            setStep("credentials");
            setOtp("");
            setError(null);
          }}
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          Edit email or password
        </button>
      </div>

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
