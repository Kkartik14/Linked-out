'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { userProfileSchema, lCardSchema, paginatedSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const lsSchema = paginatedSchema(lCardSchema);

describe('13 · users & profiles (contract §4.2)', () => {
  let me;
  let other;

  beforeEach(async () => {
    await h.resetDb();
    me = await h.createUser({ username: 'mine', name: 'Me', bio: 'hi', status: 'BUILDING' });
    other = await h.createUser({ username: 'other' });
  });

  test('GET /users/:username is public and matches UserProfile', async () => {
    const res = await h.get('/users/mine');
    const profile = h.expectShape(res, userProfileSchema);

    assert.equal(profile.username, 'mine');
    assert.equal(profile.bio, 'hi');
    assert.equal(profile.status, 'BUILDING');
    assert.deepEqual(profile.counts, { followers: 0, following: 0 });
    assert.deepEqual(profile.viewer, { isFollowing: false, isSelf: false });
  });

  test('reputation is exposed as raw numbers for the FE to label', async () => {
    const res = await h.get('/users/mine');
    assert.deepEqual(res.body.reputation, {
      storiesShared: 0,
      lessonsShared: 0,
      buildersHelped: 0,
      lsShared: 0,
      collectionsCreated: 0,
    });
  });

  test('an unknown username is 404 USER_NOT_FOUND', async () => {
    h.expectError(await h.get('/users/ghost'), 404, 'USER_NOT_FOUND');
  });

  test('viewer.isSelf is true only on your own profile', async () => {
    const own = await h.get('/users/mine', { cookie: me.cookie });
    assert.equal(own.body.viewer.isSelf, true);

    const theirs = await h.get('/users/other', { cookie: me.cookie });
    assert.equal(theirs.body.viewer.isSelf, false);
  });

  // ─── PATCH /users/me ───────────────────────────────────────────────────────

  test('PATCH /users/me updates only the fields sent', async () => {
    const res = await h.patch('/users/me', { cookie: me.cookie, body: { name: 'Renamed' } });
    const profile = h.expectShape(res, userProfileSchema);

    assert.equal(profile.name, 'Renamed');
    assert.equal(profile.bio, 'hi', 'untouched fields survive');
    assert.equal(profile.viewer.isSelf, true);
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('set-cookie')].filter(Boolean);
    assert.ok(
      setCookies.every((value) => !value.startsWith('lo_access=')),
      'ordinary profile edits must not mint a fresh access lifetime',
    );
  });

  test('PATCH /users/me with an empty body is rejected (must change at least one field)', async () => {
    // CONTRACT-01: an empty PATCH is a caller bug, not a silent no-op.
    h.expectError(
      await h.patch('/users/me', { cookie: me.cookie, body: {} }),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('PATCH /users/me rejects an unknown field instead of silently stripping it', async () => {
    // CONTRACT-01: a misspelled privacy/profile field must not be quietly dropped.
    h.expectError(
      await h.patch('/users/me', { cookie: me.cookie, body: { usernam: 'typo' } }),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('explicit nulls clear name, bio and status', async () => {
    const res = await h.patch('/users/me', {
      cookie: me.cookie,
      body: { name: null, bio: null, status: null },
    });
    const profile = h.expectShape(res, userProfileSchema);

    assert.equal(profile.name, null);
    assert.equal(profile.bio, null);
    assert.equal(profile.status, null);
  });

  test('onboarding: setting a username flips needsOnboarding to false', async () => {
    const fresh = await h.createOnboardingUser();
    assert.equal((await h.get('/auth/me', { cookie: fresh.cookie })).body.needsOnboarding, true);

    const res = await h.patch('/users/me', {
      cookie: fresh.cookie,
      body: { username: 'brand_new1', name: 'New Builder' },
    });
    assert.equal(h.expectShape(res, userProfileSchema).username, 'brand_new1');
    assert.equal((await h.get('/auth/me', { cookie: fresh.cookie })).body.needsOnboarding, false);
  });

  test('onboarding refreshes the access principal so writes work immediately', async () => {
    const fresh = await h.createOnboardingUser();
    const updated = await h.patch('/users/me', {
      cookie: fresh.cookie,
      body: { username: 'ready_to_write' },
    });
    h.expectShape(updated, userProfileSchema);

    const setCookies =
      typeof updated.headers.getSetCookie === 'function'
        ? updated.headers.getSetCookie()
        : [updated.headers.get('set-cookie')].filter(Boolean);
    const accessCookie = setCookies
      .map((value) => value.split(';', 1)[0])
      .find((value) => value.startsWith('lo_access='));
    assert.ok(accessCookie, 'PATCH /users/me must refresh the username-bearing access cookie');

    const created = await h.post('/ls', {
      cookie: accessCookie,
      body: {
        title: 'First post after onboarding',
        story: 'The updated access principal should be usable without waiting 15 minutes.',
        type: 'L',
        visibility: 'PUBLIC',
        isAnonymous: false,
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
  });

  test('a taken username is 409 USERNAME_TAKEN', async () => {
    const res = await h.patch('/users/me', { cookie: me.cookie, body: { username: 'other' } });
    h.expectError(res, 409, 'USERNAME_TAKEN');
  });

  test('re-submitting your own username is not a conflict', async () => {
    const res = await h.patch('/users/me', { cookie: me.cookie, body: { username: 'mine' } });
    h.expectShape(res, userProfileSchema);
  });

  test('an invalid username is 422 USERNAME_INVALID', async () => {
    const invalid = ['ab', 'x'.repeat(31), 'Upper', 'has space', 'has-dash', 'emoji🙂', 'dot.dot'];
    for (const username of invalid) {
      const res = await h.patch('/users/me', { cookie: me.cookie, body: { username } });
      h.expectError(res, 422, 'USERNAME_INVALID');
    }
  });

  test('a valid username accepts lowercase letters, digits and underscores', async () => {
    for (const username of ['abc', 'a_b_1', 'x'.repeat(30)]) {
      const res = await h.patch('/users/me', { cookie: me.cookie, body: { username } });
      assert.equal(h.expectShape(res, userProfileSchema).username, username);
    }
  });

  test('name and bio limits are enforced with VALIDATION_ERROR details', async () => {
    const longName = await h.patch('/users/me', {
      cookie: me.cookie,
      body: { name: 'x'.repeat(81) },
    });
    const nameError = h.expectError(longName, 400, 'VALIDATION_ERROR');
    assert.equal(nameError.details[0].field, 'name');
    assert.equal(nameError.details[0].code, 'too_long');

    const longBio = await h.patch('/users/me', { cookie: me.cookie, body: { bio: 'x'.repeat(281) } });
    h.expectError(longBio, 400, 'VALIDATION_ERROR');

    h.expectShape(
      await h.patch('/users/me', { cookie: me.cookie, body: { name: 'x'.repeat(80), bio: 'y'.repeat(280) } }),
      userProfileSchema,
    );
  });

  test('an invalid status is rejected', async () => {
    const res = await h.patch('/users/me', { cookie: me.cookie, body: { status: 'VIBING' } });
    const error = h.expectError(res, 400, 'VALIDATION_ERROR');
    assert.equal(error.details[0].code, 'invalid_enum');
  });

  test('every JourneyStatus value is accepted', async () => {
    const statuses = ['INTERVIEWING', 'BUILDING', 'WORKING', 'STARTING_UP', 'RECOVERING', 'TAKING_A_BREAK'];
    for (const status of statuses) {
      const res = await h.patch('/users/me', { cookie: me.cookie, body: { status } });
      assert.equal(h.expectShape(res, userProfileSchema).status, status);
    }
  });

  test('image must be an avatar URL this user uploaded', async () => {
    const mine = `${h.R2_PUBLIC_BASE_URL}/avatars/${me.id}/01ARZ3NDEKTSV4RRFFQ69G5FAV.jpg`;
    const res = await h.patch('/users/me', { cookie: me.cookie, body: { image: mine } });
    assert.equal(h.expectShape(res, userProfileSchema).image, mine);
  });

  test("image from another user's avatar folder or an arbitrary host is rejected", async () => {
    const hostile = [
      `${h.R2_PUBLIC_BASE_URL}/avatars/${other.id}/x.jpg`,
      `${h.R2_PUBLIC_BASE_URL}/avatars/../secrets.jpg`,
      'https://evil.example.com/pwn.jpg',
      `https://evil.example.com/${h.R2_PUBLIC_BASE_URL}/avatars/${me.id}/x.jpg`,
    ];
    for (const image of hostile) {
      const res = await h.patch('/users/me', { cookie: me.cookie, body: { image } });
      h.expectError(res, 400, 'VALIDATION_ERROR');
    }
  });

  test('a non-URL image is rejected with not_a_url', async () => {
    const res = await h.patch('/users/me', { cookie: me.cookie, body: { image: 'not a url' } });
    const error = h.expectError(res, 400, 'VALIDATION_ERROR');
    assert.equal(error.details[0].code, 'not_a_url');
  });

  test('image can be cleared with null', async () => {
    const res = await h.patch('/users/me', { cookie: me.cookie, body: { image: null } });
    assert.equal(h.expectShape(res, userProfileSchema).image, null);
  });

  test('PATCH /users/me requires authentication', async () => {
    h.expectError(await h.patch('/users/me', { body: { name: 'x' } }), 401, 'UNAUTHENTICATED');
  });

  // ─── GET /users/:username/ls ────────────────────────────────────────────────

  test('GET /users/:username/ls returns the author’s Ls, newest first', async () => {
    const first = await h.createL(me.id, { title: 'first' });
    const second = await h.createL(me.id, { title: 'second' });

    const res = await h.get('/users/mine/ls');
    const page = h.expectShape(res, lsSchema);
    assert.deepEqual(page.data.map((c) => c.id), [second.id, first.id]);
  });

  test('GET /users/:username/ls?type filters to a profile section', async () => {
    const story = await h.createL(me.id, { type: 'STORY' });
    await h.createL(me.id, { type: 'SCAR' });

    const res = await h.get('/users/mine/ls?type=STORY');
    assert.deepEqual(res.body.data.map((c) => c.id), [story.id]);

    h.expectError(await h.get('/users/mine/ls?type=story'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/users/mine/ls?type=NOPE'), 400, 'VALIDATION_ERROR');
  });

  test('every LType is a valid profile-section filter', async () => {
    for (const type of ['L', 'WIN', 'STORY', 'SCAR', 'PLOT_TWIST', 'CHECKPOINT', 'BATTLE', 'LESSON']) {
      h.expectShape(await h.get(`/users/mine/ls?type=${type}`), lsSchema);
    }
  });

  test('GET /users/:username/ls enforces visibility per viewer', async () => {
    const pub = await h.createL(me.id, { visibility: 'PUBLIC' });
    const followersOnly = await h.createL(me.id, { visibility: 'FOLLOWERS' });
    const priv = await h.createL(me.id, { visibility: 'PRIVATE' });

    assert.deepEqual((await h.get('/users/mine/ls')).body.data.map((c) => c.id), [pub.id]);

    const owner = await h.get('/users/mine/ls', { cookie: me.cookie });
    assert.equal(owner.body.data.length, 3);
    void priv;

    const stranger = await h.get('/users/mine/ls', { cookie: other.cookie });
    assert.deepEqual(stranger.body.data.map((c) => c.id), [pub.id]);

    await h.follow(other.id, me.id);
    const follower = await h.get('/users/mine/ls', { cookie: other.cookie });
    assert.deepEqual(
      follower.body.data.map((c) => c.id).sort(),
      [pub.id, followersOnly.id].sort(),
    );
  });

  test('GET /users/:username/ls for an unknown user is 404', async () => {
    h.expectError(await h.get('/users/ghost/ls'), 404, 'USER_NOT_FOUND');
  });

  test('GET /users/:username/ls paginates without overlap', async () => {
    for (let i = 0; i < 5; i += 1) await h.createL(me.id, { title: `L${i}` });

    const first = h.expectShape(await h.get('/users/mine/ls?limit=2'), lsSchema);
    const second = h.expectShape(
      await h.get(`/users/mine/ls?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`),
      lsSchema,
    );
    const overlap = first.data.filter((a) => second.data.some((b) => b.id === a.id));
    assert.equal(overlap.length, 0);
  });
});
