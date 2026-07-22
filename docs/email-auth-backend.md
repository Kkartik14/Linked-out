# Email login backend — feature 1.1.3

This documents the backend contract for email/password signup, email verification, normal password
login, resend, and forgot/reset password. The web app implements the matching screens separately
(signup, OTP verification, login, resend, forgot/reset), against the shapes in
[`local/contract.md` §6](../local/contract.md). A real email provider is still deferred — delivery
runs through the stub until it is wired.

## Credential-authoring rule (read first)

**The account password is set at `POST /auth/email/verify`, together with the emailed code — not at
signup.** Signup carries the email only. Setting the password at signup and committing it on later
verification enables account **pre-hijacking**: anyone could start a signup for a victim's address
with an attacker password, and the victim's verification would create an account holding it
(Sudhodanan & Paverd, *Pre-hijacked accounts*, USENIX Security 2022; OWASP: "do not activate
accounts before verification is completed"). Binding password authorship to code possession removes
the pre-verification credential entirely.

Frontend impact: collect email **and** password on the signup screen as before, but send only the
email to `/signup`; hold the password client-side and submit it with the code to `/verify`.

## Public API flow

All paths are below `/v1`.

| Step | Endpoint | Body | Success |
|---|---|---|---|
| Start signup | `POST /auth/email/signup` | `{ email }` | `202 { accepted: true, expiresInSeconds: 600 }` |
| Inspect stub delivery | `POST /auth/email/otp/inspect` | `{ email, purpose }` | current encrypted-capture OTP (protected header) |
| Verify + set password | `POST /auth/email/verify` | `{ email, otp, password, returnTo? }` | one-time session handoff code |
| Password login | `POST /auth/email/login` | `{ email, password, returnTo? }` | one-time session handoff code |
| Resend | `POST /auth/email/resend` | `{ email, purpose }` | same generic `202` envelope |
| Forgot password | `POST /auth/email/password/forgot` | `{ email }` | same generic `202` for known/unknown email |
| Reset password | `POST /auth/email/password/reset` | `{ email, otp, newPassword }` | `200 { ok: true }` |

Verification and login reuse the existing OAuth handoff/session authority. The frontend can use
the same server-side handoff exchange it already uses for OAuth; there is no second session type.

## Persisted data and invariants

- `PasswordCredential` stores only an Argon2id PHC string (`m=19456 KiB, t=2, p=1`).
- `EmailOtpChallenge` has one durable row per canonical email and purpose.
- The eight-digit code is generated with `crypto.randomInt`, accepted at most once, expires in
  10 minutes, and is exhausted after five wrong entries.
- Verification looks up by canonical email plus purpose; codes are never globally searchable.
- The challenge stores only an HMAC-SHA-256 digest with a deployment secret outside Neon.
- `EmailOtpOutbox` stores AES-256-GCM ciphertext for the temporary stub inspector. It cascades on
  challenge cleanup and is deleted immediately on consumption.
- A same-email issuance transaction takes a deterministic PostgreSQL advisory transaction lock.
  Different emails do not contend. Concurrent correct verifications produce exactly one account.
- Signup verification checks the code under the per-subject lock (without consuming it, so Argon2
  runs outside any transaction), then consumes the code and creates the user + Argon2id credential
  in one transaction. A hashing or database failure never burns a valid code without an account.
- Password reset updates the credential, consumes the challenge, deletes the encrypted capture,
  deletes legacy refresh sessions, and revokes every browser session in one transaction. Because
  consumption is atomic with the change, overlapping resets cannot apply out of order.

The product requirement is that resend keeps the same active code during its 10-minute window.
That intentionally differs from the common rotate-on-resend recommendation; it avoids multiple
emails with conflicting codes. After expiry/exhaustion, the next eligible request creates a new
code.

## Configuration

Set these on the API project for every environment that uses this feature:

```dotenv
EMAIL_DELIVERY_MODE=stub
EMAIL_OTP_PEPPER=<at least 32 random bytes; distinct from every other secret>
EMAIL_OTP_ENCRYPTION_KEY=<exactly 32 random bytes encoded as base64url>
EMAIL_OTP_INSPECTION_SECRET=<at least 32 random bytes; distinct from every other secret>
```

`EMAIL_DELIVERY_MODE=disabled` makes every email-auth endpoint fail closed with
`PROVIDER_NOT_CONFIGURED`. The inspection endpoint also fails closed unless mode is `stub`, uses a
constant-time secret comparison, is rate-limited, and sends `Cache-Control: private, no-store`.
Treat it as an admin/account-takeover capability: keep Vercel Deployment Protection or an
equivalent second access control in front of any production deployment that exposes it.

Import the collection and environment in `postman/`. Fill `otpInspectionSecret` locally—never
commit it—and run the requests in order.

## Frontend handoff contract

Successful verify/login returns:

```json
{
  "code": "43-character-one-time-base64url-code",
  "expiresAt": "ISO timestamp about 60 seconds from now",
  "returnTo": "/feed"
}
```

The frontend should send `code` through its existing private OAuth handoff exchange, set the
returned opaque `lo_sid` as an HttpOnly cookie, and then navigate to `returnTo`. Never store the
handoff or browser-session cookie in local storage.

## Deferred provider work

`TODO(Kartik asked it): replace the stub OTP delivery adapter and protected inspection route with
the production email provider; add a transactional delivery worker/outbox, idempotency,
provider retries/dead letters, SPF/DKIM/DMARC, and security-notification templates.`

The cited production research and load-testing checklist are in
[`docs/research/email-otp-auth.md`](research/email-otp-auth.md).
