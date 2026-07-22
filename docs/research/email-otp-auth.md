# Production email/password authentication and email OTP design

**Feature:** 1.1.3 email login
**Target stack:** LinkedOut NestJS API, Prisma/PostgreSQL on Neon, Vercel Functions
**Research date:** 2026-07-22
**Status:** implementation guidance; the email provider remains intentionally replaceable

## Decision summary

LinkedOut should implement email/password login as a separate credential attached to the existing `User`, reuse the existing opaque `BrowserSession` authority, and model each email verification or password-reset attempt as a durable, purpose-bound challenge.

The recommended starting policy is:

- Generate an **8-digit numeric OTP** with Node's cryptographically secure `crypto.randomInt(0, 100_000_000)`, retaining leading zeroes.
- Bind verification to the tuple `(challengeId, canonicalEmail, purpose, code)`. Never find a challenge by code alone.
- Keep an issued code valid for **10 minutes**, accept it once, allow at most **5 failed entries**, and make resend generate a new code that immediately supersedes the old one without resetting the subject's failure budget.
- Persist an **HMAC-SHA-256 digest**, not the OTP. Keep the HMAC key outside PostgreSQL and version the key.
- Hash passwords with **Argon2id**, initially at OWASP's minimum `m=19 MiB, t=2, p=1`, benchmarked in the deployed Vercel runtime and encoded as a PHC string so parameters can be upgraded.
- Give request/login/reset endpoints uniform, non-enumerating responses and apply limits by normalized email, IP/network signal, and route. Do not permanently lock an account because someone requested or guessed reset codes.
- Make successful OTP consumption and the protected state change one PostgreSQL transaction. A reset verification should issue a short-lived, single-purpose reset grant; using that grant changes the password and revokes all sessions in one transaction.
- Put delivery behind an `EmailOtpDelivery` interface. The initial stub stores a separately encrypted, short-lived delivery capture that an explicitly enabled and strongly protected inspection endpoint can retrieve. A later provider adapter replaces the stub without changing challenge rules.

Email verification proves control of an inbox; it is **not strong MFA**. NIST excludes email from general out-of-band authentication, while expressly allowing confirmation codes used to prove control of an email address and recovery codes sent by email ([NIST SP 800-63B, out-of-band devices](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/#out-of-band-devices)). OWASP likewise describes email as a weak factor and says not to rely on email alone for sensitive account security ([OWASP Email Validation and Verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html#email-as-an-authentication-factor)).

## What standards say

NIST requires issued recovery codes to contain at least six decimal digits from an approved random generator. Its current maximum validity for a code delivered to email is 24 hours, so a LinkedOut 10-minute window is substantially tighter, not a relaxation ([NIST SP 800-63B, issued recovery codes](https://pages.nist.gov/800-63-4/sp800-63b.html#issued-recovery-codes)). NIST also requires OTPs to be accepted only once and requires rate limiting for outputs under 64 bits ([NIST SP 800-63B, OTP verifiers](https://pages.nist.gov/800-63-4/sp800-63b.html#single-factor-otp)).

OWASP's more directly applicable application guidance requires ownership-verification tokens to be cryptographically random, single-use, time-limited, and unavailable for account activation until verification completes ([OWASP Email Validation and Verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html#email-ownership-verification)). Its OTP guidance recommends a short TTL, strict attempt limits, invalidation on success, no plaintext long-term storage or logging, considering 8+ digits where usable, and replacing the old code on resend ([OWASP Multifactor Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html#one-time-password-otp-handling-and-storage)).

These sources define security properties, not a universal TTL. Ten minutes is therefore a product risk/usability choice within those bounds.

## Entropy, collisions, and 10,000 simultaneous requests

An 8-digit decimal code has `100,000,000` possibilities, or about **26.6 bits**. A 6-digit code has about **19.9 bits**. Node documents that `crypto.randomInt` returns a random integer in the requested range while avoiding modulo bias ([Node.js `crypto.randomInt`](https://nodejs.org/api/crypto.html#cryptorandomintmin-max-callback)); do not use `Math.random`, timestamps, counters, UUID substrings, or `%` over arbitrary random bytes.

For `n` independently generated codes from a space of size `N`:

- expected equal pairs = `n(n-1)/(2N)`;
- probability of at least one equal pair is approximately `1 - exp(-n(n-1)/(2N))`.

At 10,000 concurrent issuances:

| Code space | Expected equal pairs | Chance of any duplicate |
|---|---:|---:|
| 6 digits (`N=10^6`) | 49.995 | effectively 100% |
| 8 digits (`N=10^8`) | 0.49995 | about 39.3% |
| 10 digits (`N=10^10`) | 0.0049995 | about 0.50% |

This birthday collision is **not** the probability that an attacker can verify somebody else's challenge. Verification must first select the exact challenge (or exact canonical email and purpose) and then compare that challenge's digest. Two recipients can safely receive the same display code because neither code is globally valid.

LinkedOut should therefore not promise that all 10,000 displayed values are globally distinct. Enforcing global uniqueness would add a shared allocation hotspot and encourage unsafe lookup by code alone. The real invariant is: every request has a distinct high-entropy `challengeId`, every OTP is generated independently, and a code is usable only for its bound challenge/email/purpose.

With five online guesses against one 8-digit challenge, a uniformly random attacker succeeds with probability at most `5 / 10^8` (one in 20 million). Limits remain essential because the numeric code is far below 64 bits; NIST says generating a replacement code must not reset the failed-authentication count ([NIST SP 800-63B, out-of-band verifiers](https://pages.nist.gov/800-63-4/sp800-63b.html#out-of-band-verifiers)).

## Why 10 minutes

Ten minutes is a defensible initial balance for email:

- It accommodates provider queuing, greylisting, mobile notification delay, opening another device, and manual entry better than two minutes.
- It bounds replay/exposure far more tightly than NIST's 24-hour maximum for email recovery codes.
- It is still long enough that normal delivery variance should not turn resend into the default path, which would expand traffic and confusion.

The code remains unchanged until it is consumed, superseded, attempt-exhausted, or its database `expiresAt` passes. The server must use the database clock for acceptance, not a client timestamp. TTL begins when the stub records delivery; when a queued provider is added, record `deliveredAt` and avoid sending a code whose remaining lifetime is too short.

Treat 10 minutes as a measured default. Instrument creation-to-verification latency and provider delivery delay without logging codes or full email addresses. If p99 legitimate completion is comfortably lower, consider shortening the TTL; if delivery routinely approaches it, fix delivery first rather than silently lengthening reset exposure.

## OTP storage and comparison

A plain SHA-256 digest is not enough protection against a database leak: all 100 million 8-digit values can be tested offline. OWASP makes the same point—hashing an OTP is useful for hygiene but does not give password-like offline resistance because the keyspace is small ([OWASP MFA, hashing OTPs](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html#hashing-otps)).

Store this instead:

```text
otpDigest = HMAC-SHA-256(
  OTP_HMAC_KEY[keyVersion],
  "linkedout-otp-v1\0" || challengeId || "\0" || purpose || "\0" || canonicalEmail || "\0" || otp
)
```

HMAC is a standard keyed message-authentication construction ([RFC 2104](https://www.rfc-editor.org/rfc/rfc2104.html)). Binding all fields prevents a digest copied between challenges, purposes, or identities from working. Store `keyVersion` beside the digest, keep keys in Vercel's secret store rather than the database or repository, and support a current plus previous verification key during rotation.

Compute the candidate HMAC in the API and compare fixed-length byte buffers with `crypto.timingSafeEqual`; Node documents that it performs a constant-time byte comparison, while warning that surrounding code must also avoid timing leaks ([Node.js `crypto.timingSafeEqual`](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b)). Never return a reason such as expired, wrong, superseded, or exhausted to an unauthenticated caller; return one generic invalid-code response.

## Proposed persistence model

The exact Prisma names can follow repository conventions, but the database should represent these concepts.

### `EmailCredential`

| Column | Constraint/purpose |
|---|---|
| `userId` | primary key and FK to `User(id)` with cascade |
| `passwordHash` | Argon2id PHC string; never plaintext or reversible encryption |
| `passwordChangedAt` | supports auditing and session invalidation policy |
| `createdAt`, `updatedAt` | lifecycle metadata |

Keep password material out of `Account`, whose existing shape is OAuth-provider oriented. A user can then own OAuth accounts and an email credential without identity duplication.

Add a unique `User.emailCanonical` identity key while retaining the originally entered `User.email` for display/delivery. Normalize the domain to lowercase, avoid provider-specific transforms such as Gmail dot removal, and document one policy used consistently by signup, login, verification, reset, and account linking. OWASP recommends storing original and canonical values and warns that the SMTP local part is technically case-sensitive ([OWASP email canonicalization and case sensitivity](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html#email-canonicalization)). A pragmatic LinkedOut policy may case-fold the whole address, but that must be an explicit product decision with migration collision checks.

### `EmailOtpChallenge`

| Column | Constraint/purpose |
|---|---|
| `id` | unique ULID; public opaque workflow identifier, not the secret |
| `purpose` | enum: `VERIFY_EMAIL`, `RESET_PASSWORD` |
| `emailCanonical` | binds the challenge to the identity key |
| `userId` | nullable FK; reset targets an existing user, signup may create the user in the same transaction |
| `otpDigest` | fixed 32-byte `bytea` (or 64-char hex) |
| `keyVersion` | HMAC key selector |
| `attemptCount`, `maxAttempts` | defaults `0` and `5`, with check constraints |
| `createdAt`, `expiresAt` | `expiresAt > createdAt`; 10-minute default is application policy |
| `consumedAt`, `supersededAt` | mutually exclusive terminal states |

Recommended indexes:

```sql
CREATE UNIQUE INDEX email_otp_one_open_subject_purpose
ON "EmailOtpChallenge" ("emailCanonical", "purpose")
WHERE "consumedAt" IS NULL AND "supersededAt" IS NULL;

CREATE INDEX email_otp_expiry_cleanup
ON "EmailOtpChallenge" ("expiresAt", "id");

CREATE INDEX email_otp_user_history
ON "EmailOtpChallenge" ("userId", "purpose", "createdAt" DESC);
```

PostgreSQL supports unique partial indexes for uniqueness over only qualifying rows ([PostgreSQL partial indexes](https://www.postgresql.org/docs/current/indexes-partial.html)). Because an expired row still satisfies the static partial-index predicate, issuance must supersede any prior open row before inserting a replacement. Catch a concurrent unique violation and retry the short issuance transaction. Do not put `expiresAt > now()` in an index predicate: time-dependent predicates are not immutable.

### `PasswordResetGrant`

After OTP verification, return a new random 256-bit base64url reset token, persist only a purpose-bound HMAC digest, and give it a short TTL such as five minutes. Columns mirror `id/tokenDigest/keyVersion/userId/expiresAt/consumedAt`. This restricted grant can authorize only `POST /auth/password-reset/complete`; it is not a login session. OWASP describes creating a limited session from a verified PIN and recommends that the user log in normally after reset rather than being logged in automatically ([OWASP Forgot Password, PINs and reset completion](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html#pins)).

### `OtpDeliveryCapture` (stub only)

To inspect a code, some component must retain recoverable plaintext. Do not weaken the challenge table for this. Store a separately AES-256-GCM-encrypted capture keyed by `challengeId`, with `ciphertext`, random nonce, authentication tag, `createdAt`, and `expiresAt`. Keep `OTP_STUB_ENCRYPTION_KEY` separate from `OTP_HMAC_KEY`. Delete the capture after expiry and never copy it to logs, metrics, traces, analytics, Postman examples, fixtures, or error messages. OWASP explicitly says never to log verification/reset tokens or full reset URLs ([OWASP Email Validation and Verification, logging](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html#logging-and-monitoring)).

## Transaction and concurrency design

### Issue or resend

1. Validate and canonicalize the email, then reserve both subject-purpose and network/IP rate-limit permits.
2. Generate the OTP and `challengeId` in the application with the CSPRNG.
3. In one short transaction: create/update the pending user and credential as appropriate; mark the prior open challenge for that subject/purpose superseded; insert the new challenge; and, in stub mode, insert its encrypted delivery capture.
4. Commit before any later external provider call. Return the same `202 Accepted` envelope for existent and nonexistent reset targets.

Resend creates a new OTP and supersedes the old challenge, as OWASP recommends. It does **not** clear the broader verification-failure bucket. The unique partial index resolves accidental multiple-active states across Vercel instances.

For a real provider, use a transactional outbox or managed queue keyed idempotently by `challengeId`. A worker should call the provider outside the database transaction and record delivery outcome/retry metadata. This prevents holding locks across network I/O and buffers a 10,000-request burst against provider rate limits. Never make the provider response the source of truth for whether a code is valid.

### Verify and consume

Use a short PostgreSQL transaction and lock the selected challenge row (`SELECT ... FOR UPDATE`), or use an equivalent guarded `UPDATE ... RETURNING`:

1. Select by `id`, canonical email, and purpose—not by OTP.
2. Require `consumedAt IS NULL`, `supersededAt IS NULL`, `expiresAt > CURRENT_TIMESTAMP`, and `attemptCount < maxAttempts`.
3. Compute and constant-time compare the candidate digest.
4. Increment `attemptCount` on every submitted guess. On a match, also set `consumedAt = CURRENT_TIMESTAMP` and perform the protected change in the same transaction:
   - verification: set `User.emailVerified` once;
   - reset verification: create the one-use `PasswordResetGrant`.
5. Commit, then return a generic success or invalid response.

PostgreSQL row locks block concurrent writers to the same row until the transaction ends ([PostgreSQL explicit row locking](https://www.postgresql.org/docs/current/explicit-locking.html)). `UPDATE ... RETURNING` returns only the row actually won by the guarded update, avoiding a separate check-then-write race ([PostgreSQL `RETURNING`](https://www.postgresql.org/docs/current/dml-returning.html)). Thus two simultaneous correct submissions cannot both consume one challenge. Ten thousand different challenges do not contend on one row.

### Complete password reset

In one transaction, atomically consume the unexpired reset grant, replace the Argon2id password hash, set `passwordChangedAt`, and revoke all existing `BrowserSession` rows for the user (and any other legacy session rows still accepted). Do not auto-login. Return the same response if a concurrent request already consumed the grant.

OWASP recommends notifying the user after reset, not emailing the password, and offering or automatically performing session invalidation ([OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html#user-resets-password)). LinkedOut should choose automatic all-session revocation because a password reset is an account-recovery event. The future provider adapter should also send a password-changed security notification.

## Password policy and login

Because normal LinkedOut login uses the password as a single factor, follow NIST's current policy:

- minimum 15 characters; allow at least 64;
- no required mixtures of upper/lowercase/numbers/symbols;
- reject commonly used, expected, or compromised passwords using a blocklist;
- allow password managers, autofill, and paste;
- do not require periodic rotation absent evidence of compromise.

These are current NIST requirements and recommendations ([NIST SP 800-63B, password verifiers](https://pages.nist.gov/800-63-4/sp800-63b.html#password-verifiers)). Set a reasonable maximum input byte length (for example 1 KiB) before expensive hashing to prevent resource exhaustion, and make Unicode normalization behavior explicit and consistent.

**As-built product decision (Kartik, 2026-07-22):** LinkedOut deliberately uses an 8-character
minimum and 128-character maximum, with no composition requirements, an advisory zxcvbn strength
meter, and breached/common-password rejection. This is a consumer-product compromise rather than
the 15-character NIST single-factor minimum recorded above. Breach checks use HIBP's k-anonymous
five-character prefix range API plus a local obvious-password fallback and fail open on provider
unavailability; this decision must be revisited if the authentication assurance level changes.

Use Argon2id, unique salts managed by the library, and a PHC-format result. OWASP's current minimum is 19 MiB memory, two iterations, one degree of parallelism; it recommends benchmarking so one hash remains below about one second and warns that excessive work enables denial of service ([OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#password-hashing-algorithms)). Rehash on successful login when stored parameters are below the current policy.

Login must require `emailVerified != null`. For a nonexistent email, still run one verification against a fixed dummy Argon2id hash so response timing and status resemble a wrong password. Always return a generic `401` such as `Invalid email or password`; do not reveal whether the email exists, has no password credential, or is unverified.

## Rate limits and anti-enumeration

OWASP requires consistent messages and approximately uniform response time for nonexistent and existent reset accounts and calls for per-account automation controls to prevent inbox flooding ([OWASP Forgot Password, request handling](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html#forgot-password-request)). It also warns not to lock the account in response to forgot-password abuse because that enables denial of service ([OWASP Forgot Password, account lockout](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html#account-lockout)).

LinkedOut already has a PostgreSQL-backed `RateLimiter` and `RateLimitBucket`; reuse it with HMAC-pseudonymized email keys so raw addresses are not persisted in rate-limit keys. Starting limits to validate under QA and production telemetry are:

| Action | Subject limit | Network/IP signal | Challenge limit |
|---|---|---|---|
| Signup/verification issue | 1/minute, 5/hour per canonical email | 30/hour per IP, with NAT-aware monitoring | one open challenge |
| Reset issue | 1/minute, 5/hour per canonical email | 30/hour per IP | one open challenge |
| OTP entry | shared failure window survives resend | 60/hour per IP | 5 failed entries |
| Password login | progressive delay per email plus a longer window | additional IP/network bucket | no permanent public lockout |
| Stub inspection | very small operator-only limit | deployment/network gate | exact challenge ID only |

These numbers are conservative initial product settings, not values mandated by NIST or OWASP. Return `429` with `Retry-After` where it does not reveal account existence. Add exponential backoff or bot challenges for suspicious traffic. Do not depend on IP alone, and keep a global/provider queue limit so a distributed attack cannot turn into unlimited email cost.

NIST's 100 consecutive failures is an upper bound, not a recommended target; it explicitly permits lower limits and adaptive delays ([NIST SP 800-63B, rate limiting](https://pages.nist.gov/800-63-4/sp800-63b.html#rate-limiting-throttling)). Five is appropriate for a short email OTP provided that requesting a replacement remains possible and abuse cannot permanently disable the account.

API response examples should remain generic:

```json
// signup/verification/reset request, whether or not an eligible account exists
{ "status": "accepted", "requestId": "01...", "expiresInSeconds": 600 }

// login
{ "statusCode": 401, "message": "Invalid email or password" }

// OTP failure (wrong, expired, superseded, consumed, or exhausted)
{ "statusCode": 400, "message": "Invalid or expired verification code" }
```

For nonexistent reset emails, return a syntactically valid random `requestId` but create no challenge and send nothing. Ensure the work is asynchronous or otherwise padded enough that the response-time distribution does not trivially identify the branch. OWASP calls for both consistent content and uniform timing ([OWASP Authentication, discrepancy factors](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#authentication-responses)).

## Protected stub OTP inspection

The inspection endpoint is deliberately a temporary secret-disclosure capability, not ordinary product functionality. It should be fail-closed:

```text
GET /internal/test-support/email-otp/{requestId}
Authorization: Bearer <high-entropy inspection credential>
Cache-Control: no-store
```

Required controls:

1. The route exists only when `EMAIL_DELIVERY_MODE=stub` **and** `OTP_INSPECTION_ENABLED=true`; configuration validation must reject accidental mixed modes.
2. Production additionally requires an explicit break-glass acknowledgement such as `OTP_INSPECTION_ALLOW_PRODUCTION=true`. Real user traffic must not be admitted while this mode is active.
3. Put the deployment behind a second control such as Vercel Deployment Protection, an identity-aware proxy, or a network allowlist. OWASP says API keys must not be the only protection for sensitive/high-value resources ([OWASP REST Security, API keys](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html#api-keys)).
4. Store a random 256-bit inspection credential in environment secrets, compare its digest in constant time, rotate it, and never place it in the Postman collection. The collection references an uncommitted Postman environment variable.
5. Permit only exact `requestId` lookup. Provide no list, search-by-email, bulk export, or “latest OTP” route.
6. Return the OTP only while the corresponding challenge and encrypted capture are unexpired and unsuperseded. Inspection does not consume the challenge.
7. Rate-limit it; return `404` for unavailable records; set `Cache-Control: no-store`; exclude response bodies from observability; and audit access using actor/request metadata, challenge ID, and outcome—never the OTP or full email.
8. Delete encrypted captures promptly after expiry. Turning on a real provider must make the endpoint unavailable, even if a stale enable variable remains.

OWASP's secrets guidance requires least privilege, auditability, rotation, revocation, expiration, and never logging secrets ([OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)). These controls reduce risk but do not make a production plaintext-reveal endpoint equivalent to real email delivery. Use it only for controlled test accounts until the provider is wired.

## Scaling on Neon and Vercel

Code generation is process-local CSPRNG work and has no shared bottleneck. PostgreSQL work per request is a small indexed write; verification touches one challenge row. At 10,000 different identities, there is no logical lock contention. The capacity risks are connection fan-out, password-hash CPU/RAM, provider quotas, and abusive repeated requests—not OTP collision.

Use the Neon **pooled** connection string for runtime traffic. Neon uses PgBouncer in transaction mode, supports up to 10,000 client connections sharing a smaller number of real Postgres connections, and emphasizes that this does not mean 10,000 queries execute simultaneously ([Neon connection pooling](https://neon.com/docs/connect/connection-pooling)). Keep transactions short and avoid session-scoped database features because transaction pooling does not preserve session state.

Vercel recommends a globally initialized pool with Fluid Compute and proper release/idle handling; its documentation notes that unpooled serverless fan-out can exhaust database connection limits ([Vercel connection pooling](https://vercel.com/kb/guide/connection-pooling-with-functions)). Place the function in the same region as Neon. Use `DIRECT_URL` only for migrations/admin work and the pooled `DATABASE_URL` at runtime.

Ten thousand simultaneous password signups also mean 10,000 Argon2id hashes. That is intentionally expensive and cannot be made “milliseconds” end to end. Bound concurrent hashing per instance, rate-limit before hashing when safe, use backpressure, and load-test memory/CPU with the deployed Vercel shape. OTP generation and challenge persistence can complete in milliseconds under normal load; cryptographic password hashing should remain deliberately slower.

Expired challenges, grants, delivery captures, and rate-limit buckets need bounded batch cleanup using the existing maintenance pattern and `(expiresAt, id)` keyset index. Keep expired rows briefly if needed for security audit, then delete or redact secret-related material. Ten thousand rows is small for PostgreSQL; partitioning is unnecessary until measured retention volume justifies it.

## Delivery seam and later provider work

Define a narrow port such as:

```ts
interface EmailOtpDelivery {
  deliver(input: {
    challengeId: string;
    purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD';
    recipient: string;
    otp: string;
    expiresAt: Date;
  }): Promise<{ acceptedAt: Date; providerMessageId?: string }>;
}
```

The domain service owns generation, digesting, TTL, resend, attempts, and state transitions. The stub owns only encrypted capture. The future provider adapter owns rendering and provider API calls. Provider message IDs and delivery status are metadata; they never determine code validity.

**TODO(Kartik asked it): replace the stub OTP delivery adapter and protected inspection route with the production email provider; add transactional outbox/queue delivery, idempotency by `challengeId`, provider retry/dead-letter handling, domain authentication (SPF/DKIM/DMARC), and password-reset/security-notification templates.**

## Test and operational acceptance criteria

Before calling the backend production-ready, tests should prove:

- 10,000 generated challenge IDs are distinct; OTPs are exactly eight digits including leading-zero cases; statistical tests do not assert that display codes never collide.
- Every code remains valid before 10 minutes and fails at/after expiry using an injected clock plus database integration tests.
- Wrong purpose, email, challenge ID, code, expired code, superseded code, and consumed code all fail with the same public response.
- Five failed attempts exhaust the challenge; resend does not reset the subject failure budget.
- Resend invalidates the previous code and only the newest open challenge can win under concurrent issuance.
- Two simultaneous correct verifications yield exactly one success and one protected state transition.
- Password reset consumes its grant once, changes the PHC hash, revokes every existing browser session, and does not log the user in.
- Existing/nonexistent reset requests and valid/invalid login identities return the same status/shape and have comparable timing distributions.
- Passwords, OTPs, reset grants, inspection credentials, full emails, and delivery bodies never appear in logs, traces, snapshots, Postman examples, or database plaintext.
- Stub inspection is unavailable under provider mode, disabled configuration, missing second deployment control, bad credentials, expired captures, and production without explicit break-glass enablement.
- A load test exercises 10,000 distinct concurrent issue requests through the pooled Neon URL and records p50/p95/p99 latency, DB pool queueing, error rate, Vercel memory/CPU, rate-limit behavior, and cleanup throughput.

The implementation should also emit aggregate, non-secret metrics for issued, superseded, verified, failed, expired, rate-limited, delivery-accepted, and delivery-failed events. Authentication successes and failures are security events, but OTP values and full identifiers are not log fields.

## Primary sources

- [NIST SP 800-63B, Authentication and Authenticator Management](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [OWASP Email Validation and Verification Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html)
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [OWASP Multifactor Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [RFC 2104, HMAC](https://www.rfc-editor.org/rfc/rfc2104.html)
- [RFC 4086, Randomness Requirements for Security](https://www.rfc-editor.org/rfc/rfc4086.html)
- [RFC 9106, Argon2](https://www.rfc-editor.org/rfc/rfc9106.html)
- [Node.js Crypto API](https://nodejs.org/api/crypto.html)
- [PostgreSQL documentation: partial indexes, row locking, and `RETURNING`](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Neon connection pooling documentation](https://neon.com/docs/connect/connection-pooling)
- [Vercel connection pooling guidance](https://vercel.com/kb/guide/connection-pooling-with-functions)
