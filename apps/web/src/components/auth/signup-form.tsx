"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { emailAddressSchema, emailOtpSchema, passwordSchema } from "@linkedout/contracts";

import { emailResendOtp, emailSignup, emailVerify } from "@/lib/api";
import { completeEmailSession, emailAuthErrorMessage } from "@/lib/email-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OtpInput, OTP_LENGTH } from "@/components/auth/otp-input";
import { PasswordField } from "@/components/auth/password-field";
import { useResendCooldown } from "@/components/auth/use-resend-cooldown";

const PASSWORD_MIN = 15;

type Step = "credentials" | "otp";

/**
 * Email/password sign-up in two steps on one screen: choose credentials, then verify the emailed
 * code. Keeping both steps in a single client component means the email survives the transition
 * without a query round-trip, and the password never has to — verification needs only the code.
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
      setError(`Use at least ${PASSWORD_MIN} characters — a memorable passphrase works well.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await emailSignup({ email, password });
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
      const handoff = await emailVerify({ email, otp: code, returnTo });
      // Navigates away and establishes the session; keep `busy` so the form stays inert until then.
      completeEmailSession(handoff.code);
    } catch (err) {
      setError(emailAuthErrorMessage(err));
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
            placeholder="At least 15 characters"
            autoComplete="new-password"
            maxLength={128}
            aria-invalid={error !== null}
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-muted-foreground text-xs">
            Use at least {PASSWORD_MIN} characters. Length beats complexity — a passphrase you’ll
            remember is stronger than a short scramble.
          </p>
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
          Use a different email
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
