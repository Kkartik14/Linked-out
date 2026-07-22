# Next steps plan

## Feature 1.1.3 — email login

### Backend scope on `feed-email-login`

- [x] Email/password signup request with a durable 10-minute OTP challenge.
- [x] Protected stub OTP inspection for development and controlled production testing.
- [x] Email verification that creates the user and Argon2id password credential atomically.
- [x] Normal email/password login with generic invalid-credential responses.
- [x] Resend behavior: keep the same OTP while it remains active; replace it after expiry.
- [x] Forgot-password request with the same response for known and unknown emails.
- [x] OTP password reset with one-time consumption and all-session revocation.
- [x] Prisma migration, bounded cleanup, OpenAPI/shared Zod contracts, integration tests, and
  checked-in Postman collection/environment template.

### Deliberately deferred

- [ ] **TODO(Kartik asked it):** replace `StubEmailOtpDelivery` and the protected inspection route
  with the production email provider. Add a transactional delivery worker/outbox, idempotency by
  challenge, retries/dead letters, SPF/DKIM/DMARC, verification/reset/security-notification email
  templates, and remove production OTP disclosure.
- [ ] Add a breached/common-password blocklist before public launch.
- [ ] Benchmark Argon2id and run the documented 10,000-distinct-account load test on the actual
  Vercel + Neon pooled deployment; tune operational limits from p95/p99 data.
- [x] Frontend phase: the web app implements the signup, OTP verification, login, resend, and
  forgot/reset screens and reuses the server-side handoff exchange to set the HttpOnly
  browser-session cookie. Pending sync to the verify-time-password contract — the password moved
  from the signup call to the verify call (see `local/contract.md` §6); the reset-resend toast
  should say the code was re-sent, not that a "fresh" code was generated (resend reuses the active
  code within its window).

Implementation details and handoff shapes are in `docs/email-auth-backend.md`. Primary-source
security/scaling research is in `docs/research/email-otp-auth.md`.
