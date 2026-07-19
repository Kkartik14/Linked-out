'use strict';

/**
 * Backend control plane for the e2e suite.
 *
 * The specs drive the REAL Next.js app against the REAL NestJS API and a REAL Postgres
 * (`linkedout_test`). Nothing is mocked, so an e2e pass means the browser, the frontend's
 * fetch layer, cookie auth, and the API contract all genuinely agree.
 *
 * Auth: OAuth cannot run headlessly, so we mint the same `lo_access` cookie the API's
 * TokenService issues (HS256 over the test JWT secret) and install it into the browser
 * context. Everything downstream — the guard, the JWT strategy, the DB user lookup — is
 * the production code path.
 */

const path = require('node:path');
const { createHmac } = require('node:crypto');

const DB_ENTRY = path.resolve(__dirname, '../../../packages/db/dist/index.js');
const { createPrismaClient } = require(DB_ENTRY);

// The session authority is required by dist path — same as @linkedout/db — because it lives
// outside this workspace's dependency graph. Creating a session through it writes the exact
// BrowserSession row (hashed cookie, ULID sid) the production OAuth handoff would.
const SESSION_AUTHORITY_ENTRY = path.resolve(
  __dirname,
  '../../../packages/session-authority/dist/index.js',
);
const { BrowserSessionAuthority, PrismaBrowserSessionPersistence } = require(SESSION_AUTHORITY_ENTRY);

const { guardedReset } = require('../../../scripts/db-safety-guard.cjs');

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://linkedout:linkedout@localhost:5432/linkedout_test?schema=public';

const ACCESS_SECRET = process.env.E2E_JWT_ACCESS_SECRET ?? 'e2e-access-secret-0123456789abcdef';

// Purpose-scoped BFF caller key. MUST equal the value the e2e API boots with
// (playwright.config.ts), so a `session-resolve` caller assertion a spec signs is one the API's
// BffCallerGuard accepts. This is not a user-signing key and never mints identity.
const BFF_CALLER_SECRET =
  process.env.E2E_BFF_CALLER_SECRET ?? 'e2e-bff-caller-secret-0123456789abcdef';

let prisma = null;

function db() {
  if (!prisma) {
    prisma = createPrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  }
  return prisma;
}

async function disconnect() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

// ─── Session cookie ───────────────────────────────────────────────────────────

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** Mints the exact access token shape TokenService.signAccess produces. */
function accessToken(user) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      username: user.username ?? null,
      iat: nowSec,
      exp: nowSec + 900,
    }),
  );
  const signature = createHmac('sha256', ACCESS_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

// ─── Browser session (lo_sid) ───────────────────────────────────────────────────

/**
 * Create a live browser session for `user` and return its opaque `lo_sid` cookie value.
 *
 * This goes through the real `BrowserSessionAuthority`: it hashes the generated cookie the
 * same way the API does and writes a `BrowserSession` row (ULID `sid`, `sub = user.id`). The
 * returned plaintext cookie therefore resolves through the production
 * `POST /v1/auth/sessions/resolve` path. A fresh authority per call avoids holding a Prisma
 * client across a `disconnect()`.
 */
async function createBrowserSession(user) {
  const authority = new BrowserSessionAuthority(new PrismaBrowserSessionPersistence(db()));
  const created = await authority.create(user.id);
  return created.cookie;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TABLES = [
  'Notification',
  'CollectionL',
  'Collection',
  'Follow',
  'Comment',
  'Reaction',
  'L',
  'Session',
  'BrowserSession',
  'OAuthHandoff',
  'Account',
  'VerificationToken',
  'User',
  'RateLimitBucket',
];

/**
 * Waits until the API has no in-flight queries against the test database.
 *
 * Next keeps server-side fetches running after the browser navigates away (a
 * `router.refresh()` at the end of a test, say). Truncating underneath one of those makes
 * Prisma's two-round-trip `include: { author }` read an L whose author row has already
 * gone, which surfaces as a 500. Waiting for idle removes the race instead of hiding it.
 */
async function waitForIdle(timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let idleSince = 0;
  while (Date.now() < deadline) {
    const rows = await db().$queryRawUnsafe(
      `SELECT count(*)::int AS active FROM pg_stat_activity
       WHERE datname = current_database() AND state = 'active' AND pid <> pg_backend_pid()`,
    );
    if ((rows[0]?.active ?? 0) === 0) {
      idleSince ||= Date.now();
      if (Date.now() - idleSince >= 250) return;
    } else {
      idleSince = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for API database activity to settle before reset');
}

async function resetDb() {
  await waitForIdle();
  // TEST-01: verify (name allowlist + session role + fingerprinted marker) and TRUNCATE in ONE
  // transaction. The marker is planted out-of-band (scripts/bootstrap-test-db.cjs).
  const list = TABLES.map((t) => `"${t}"`).join(', ');
  await guardedReset(db(), {
    url: DATABASE_URL,
    statements: [`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`],
  });
}

/**
 * A small, deterministic world the specs share. Everything is created through Prisma
 * (not the API) so seeding never trips the API's own rate limits.
 */
async function seedWorld() {
  await resetDb();

  const kartik = await db().user.create({
    data: {
      username: 'kartik',
      email: 'kartik@example.com',
      name: 'Kartik Gupta',
      bio: 'Building in public. Surviving my Ls.',
      status: 'BUILDING',
    },
  });

  const nadia = await db().user.create({
    data: {
      username: 'nadia',
      email: 'nadia@example.com',
      name: 'Nadia Ray',
      status: 'INTERVIEWING',
    },
  });

  const newcomer = await db().user.create({
    data: { username: null, email: 'newcomer@example.com', name: 'New Comer' },
  });

  // kartik follows nadia, so the "following" feed has exactly nadia's Ls.
  await db().follow.create({ data: { followerId: kartik.id, followingId: nadia.id } });

  const google = await db().l.create({
    data: {
      authorId: kartik.id,
      title: 'Rejected after the final round at Google',
      story:
        'Four rounds in, strong signals through the onsite loop, and then the recruiter went silent for three weeks.',
      type: 'STORY',
      visibility: 'PUBLIC',
      popularityScore: 10,
    },
  });

  const startup = await db().l.create({
    data: {
      authorId: kartik.id,
      title: 'We shut down the startup after three years',
      story: 'Three years, one pivot, and no product-market fit. Here is what I would do again.',
      type: 'SCAR',
      visibility: 'PUBLIC',
      popularityScore: 5,
    },
  });

  const nadiaPublic = await db().l.create({
    data: {
      authorId: nadia.id,
      title: 'Laid off two weeks before my first anniversary',
      story: 'The all-hands lasted four minutes. I want to talk about what came after.',
      type: 'L',
      visibility: 'PUBLIC',
      popularityScore: 1,
    },
  });

  const anonymous = await db().l.create({
    data: {
      authorId: nadia.id,
      title: 'I burned out and told nobody',
      story: 'This one I am not ready to put my name on.',
      type: 'SCAR',
      visibility: 'PUBLIC',
      isAnonymous: true,
    },
  });

  const privateL = await db().l.create({
    data: {
      authorId: kartik.id,
      title: 'A private leadership lesson from a missed deadline',
      story: 'Only I can see this one.',
      type: 'LESSON',
      visibility: 'PRIVATE',
    },
  });

  const comment = await db().comment.create({
    data: {
      authorId: nadia.id,
      lId: google.id,
      body: 'Interview loops can be brutal. Thank you for writing this down.',
    },
  });
  await db().l.update({ where: { id: google.id }, data: { commentCount: 1 } });

  const collection = await db().collection.create({
    data: { ownerId: kartik.id, title: 'Google Interview Journey', slug: 'google-interview-journey' },
  });
  await db().collectionL.create({
    data: { collectionId: collection.id, lId: google.id, position: 0 },
  });
  await db().user.update({ where: { id: kartik.id }, data: { collectionsCreated: 1 } });

  // ─── Interactions that make the discovery rails rank real content ───────────
  //
  // GET /feed/sidebar counts *distinct non-author actors* per L. Without these the
  // endpoint correctly returns empty rails, and the rail specs would assert nothing.
  //
  // `createdAt` is set explicitly because the two rails read different windows: Top Ls
  // uses a rolling seven days, while L of the day uses only the *previous completed UTC
  // day*. Seeding everything at "now" would leave the daily slot permanently null.
  const startOfToday = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  // Noon yesterday: comfortably inside the closed previous-UTC-day window whatever time
  // the suite runs at.
  const yesterday = new Date(startOfToday - 12 * 60 * 60 * 1000);

  // L of the day: PUBLIC, attributed, onboarded author, interacted with yesterday. It is
  // the only candidate in that closed window, so the winner is deterministic. Being the
  // daily winner it is also excluded from Top Ls, which exercises that rule.
  await db().reaction.create({
    data: { userId: nadia.id, lId: startup.id, type: 'BEEN_THERE', createdAt: yesterday },
  });

  // Top Ls, this week. `google` already carries nadia's comment above, which counts as
  // her interaction, so only the anonymous L needs one adding.
  //
  // Deliberately nothing on `nadiaPublic`: the write-actions specs react to it as kartik
  // and assert the counts they produce, so a seeded reaction there would collide with the
  // very state those tests exist to observe.
  await db().reaction.create({
    data: { userId: kartik.id, lId: anonymous.id, type: 'HELPFUL' },
  });

  return { kartik, nadia, newcomer, google, startup, nadiaPublic, anonymous, privateL, comment, collection };
}

module.exports = {
  db,
  disconnect,
  resetDb,
  seedWorld,
  accessToken,
  createBrowserSession,
  DATABASE_URL,
  ACCESS_SECRET,
  BFF_CALLER_SECRET,
};
