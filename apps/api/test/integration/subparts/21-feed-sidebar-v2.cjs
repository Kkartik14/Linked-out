'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');
const { feedSidebarResponseSchema } = require('@linkedout/contracts/v2');

const h = require('../_harness.cjs');

function sidebar(cookie) {
  return h.request('GET', '/feed/sidebar', {
    baseUrl: h.ctx.v2BaseUrl,
    cookie,
  });
}

describe('21 · GET /v2/feed/sidebar', () => {
  beforeEach(async () => {
    await h.resetDb();
  });

  test('a guest gets a schema-valid empty aggregate with private no-store caching', async () => {
    const res = await sidebar();
    const body = h.expectShape(res, feedSidebarResponseSchema);

    assert.deepEqual(body.viewer, { state: 'SIGNED_OUT', profile: null });
    assert.deepEqual(body.peopleToFollow, { personalized: false, items: [] });
    assert.deepEqual(body.topLs.items, []);
    assert.equal(body.lOfTheDay, null);
    assert.equal(res.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.ok(Date.parse(body.refreshAfter) > Date.parse(body.generatedAt));
  });

  test('an onboarded viewer gets their own profile and personalized discovery state', async () => {
    const viewer = await h.createUser({ username: 'viewer', name: 'Ready Viewer' });

    const body = h.expectShape(await sidebar(viewer.cookie), feedSidebarResponseSchema);

    assert.equal(body.viewer.state, 'READY');
    assert.equal(body.viewer.profile.id, viewer.id);
    assert.equal(body.viewer.profile.username, 'viewer');
    assert.equal(body.viewer.profile.viewer.isSelf, true);
    assert.equal(body.peopleToFollow.personalized, true);
  });

  test('a presented invalid or expired credential is never downgraded to a guest', async () => {
    const viewer = await h.createUser({ username: 'viewer' });

    h.expectError(await sidebar(h.forgedAccessCookie(viewer)), 401, 'UNAUTHENTICATED');
    h.expectError(await sidebar(h.expiredAccessCookie(viewer)), 401, 'TOKEN_EXPIRED');
  });

  test('unknown query parameters are rejected and onboarding viewers use the global fallback', async () => {
    h.expectError(await h.request('GET', '/feed/sidebar?filter=career', {
      baseUrl: h.ctx.v2BaseUrl,
    }), 400, 'VALIDATION_ERROR');

    const onboarding = await h.createOnboardingUser();
    const body = h.expectShape(await sidebar(onboarding.cookie), feedSidebarResponseSchema);
    assert.equal(body.viewer.state, 'ONBOARDING_REQUIRED');
    assert.equal(body.viewer.profile.id, onboarding.id);
    assert.equal(body.peopleToFollow.personalized, false);
    assert.ok(body.peopleToFollow.items.every((item) => !item.viewer.canFollow));
  });

  test('people suggestions rank mutual follows before active builders and exclude unsafe candidates', async () => {
    const viewer = await h.createUser({ username: 'viewer' });
    const bridge = await h.createUser({ username: 'bridge' });
    const mutual = await h.createUser({ username: 'mutual' });
    const active = await h.createUser({ username: 'active' });
    const followed = await h.createUser({ username: 'followed' });
    const actor = await h.createUser({ username: 'actor' });
    const onboarding = await h.createOnboardingUser();
    const futureOnly = await h.createUser({ username: 'future_only' });

    await h.follow(viewer.id, bridge.id);
    await h.follow(bridge.id, mutual.id);
    await h.follow(viewer.id, followed.id);

    for (const candidate of [active, followed, onboarding]) {
      const l = await h.createL(candidate.id, { isAnonymous: false, visibility: 'PUBLIC' });
      await h.ctx.prisma.reaction.create({
        data: { userId: actor.id, lId: l.id, type: 'HELPFUL' },
      });
    }
    const futureL = await h.createL(futureOnly.id, { isAnonymous: false, visibility: 'PUBLIC' });
    await h.ctx.prisma.reaction.create({
      data: {
        userId: actor.id,
        lId: futureL.id,
        type: 'HELPFUL',
        createdAt: new Date(Date.now() + 60_000),
      },
    });

    const body = h.expectShape(await sidebar(viewer.cookie), feedSidebarResponseSchema);
    assert.deepEqual(
      body.peopleToFollow.items.map((item) => item.user.username),
      ['mutual', 'active'],
    );
    assert.deepEqual(body.peopleToFollow.items[0].reason, {
      code: 'MUTUAL_FOLLOWS',
      count: 1,
      text: '1 mutual follow',
    });
    assert.deepEqual(body.peopleToFollow.items[1].reason, {
      code: 'ACTIVE_BUILDER',
      text: 'Active builder this month',
    });
    assert.ok(body.peopleToFollow.items.every((item) => item.viewer.canFollow));
  });

  test('negative daily selections are retried after the bounded cache interval', async () => {
    const first = h.expectShape(await sidebar(), feedSidebarResponseSchema);
    assert.equal(first.lOfTheDay, null);

    const author = await h.createUser({ username: 'author' });
    const actor = await h.createUser({ username: 'actor' });
    const winner = await h.createL(author.id);
    const todayStart = new Date(`${first.generatedAt.slice(0, 10)}T00:00:00.000Z`);
    await h.ctx.prisma.reaction.create({
      data: {
        userId: actor.id,
        lId: winner.id,
        type: 'HELPFUL',
        createdAt: new Date(todayStart.getTime() - 1),
      },
    });
    await h.ctx.prisma.dailyLSelection.update({
      where: { selectedFor: todayStart },
      data: { selectedAt: new Date(Date.now() - 61_000) },
    });

    const retried = h.expectShape(await sidebar(), feedSidebarResponseSchema);
    assert.equal(retried.lOfTheDay.item.l.id, winner.id);
  });

  test('concurrent daily reads converge on one stable snapshot', async () => {
    const author = await h.createUser({ username: 'author' });
    const actor = await h.createUser({ username: 'actor' });
    const winner = await h.createL(author.id);
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await h.ctx.prisma.reaction.create({
      data: {
        userId: actor.id,
        lId: winner.id,
        type: 'HELPFUL',
        createdAt: new Date(todayStart.getTime() - 1),
      },
    });

    const responses = await Promise.all(Array.from({ length: 8 }, () => sidebar()));
    assert.ok(responses.every((response) => response.status === 200));
    assert.ok(responses.every((response) => response.body.lOfTheDay.item.l.id === winner.id));
    assert.equal(await h.ctx.prisma.dailyLSelection.count(), 1);
  });

  test('the database rejects empty and whitespace-only persisted usernames', async () => {
    const user = await h.createUser({ username: 'valid_username' });
    await assert.rejects(
      h.ctx.prisma.user.update({ where: { id: user.id }, data: { username: '   ' } }),
    );
  });

  test('Top Ls count distinct external actors in seven days without leaking private content', async () => {
    const author = await h.createUser({ username: 'author' });
    const actorOne = await h.createUser({ username: 'actor_one' });
    const actorTwo = await h.createUser({ username: 'actor_two' });
    const actorThree = await h.createUser({ username: 'actor_three' });
    const high = await h.createL(author.id, { isAnonymous: true });
    const low = await h.createL(author.id);
    const privateL = await h.createL(author.id, { visibility: 'PRIVATE' });
    const savedOnly = await h.createL(author.id);

    await h.ctx.prisma.reaction.createMany({
      data: [
        { userId: actorOne.id, lId: high.id, type: 'BEEN_THERE' },
        { userId: actorOne.id, lId: high.id, type: 'HELPFUL' },
        { userId: actorThree.id, lId: low.id, type: 'HELPFUL' },
        { userId: author.id, lId: low.id, type: 'RESPECT' },
        { userId: actorOne.id, lId: savedOnly.id, type: 'SAVED' },
        { userId: actorOne.id, lId: privateL.id, type: 'HELPFUL' },
        { userId: actorTwo.id, lId: privateL.id, type: 'HELPFUL' },
        { userId: actorThree.id, lId: privateL.id, type: 'HELPFUL' },
      ],
    });
    await h.ctx.prisma.comment.createMany({
      data: [
        { authorId: actorOne.id, lId: high.id, body: 'same actor again' },
        { authorId: actorTwo.id, lId: high.id, body: 'second actor' },
      ],
    });

    const body = h.expectShape(await sidebar(actorOne.cookie), feedSidebarResponseSchema);
    assert.deepEqual(
      body.topLs.items.map((item) => [item.l.id, item.interactionCount]),
      [
        [high.id, 2],
        [low.id, 1],
      ],
    );
    assert.equal(body.topLs.items[0].l.author, null, 'anonymous Top L remains unattributed');
    assert.deepEqual(body.topLs.items[0].l.viewer.reactions.sort(), ['BEEN_THERE', 'HELPFUL']);
    assert.equal(body.topLs.items[0].interactionLabel, '2 builders interacted');
  });

  test('L of the day snapshots the best attributed L from the previous UTC day', async () => {
    const author = await h.createUser({ username: 'author' });
    const actors = await Promise.all([
      h.createUser({ username: 'actor_one' }),
      h.createUser({ username: 'actor_two' }),
      h.createUser({ username: 'actor_three' }),
    ]);
    const winner = await h.createL(author.id);
    const anonymous = await h.createL(author.id, { isAnonymous: true });
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const previousDayInteraction = new Date(todayStart.getTime() - 12 * 60 * 60 * 1_000);

    await h.ctx.prisma.reaction.createMany({
      data: [
        { userId: actors[0].id, lId: winner.id, type: 'HELPFUL', createdAt: previousDayInteraction },
        { userId: actors[1].id, lId: winner.id, type: 'RESPECT', createdAt: previousDayInteraction },
        { userId: actors[0].id, lId: anonymous.id, type: 'HELPFUL', createdAt: previousDayInteraction },
        { userId: actors[1].id, lId: anonymous.id, type: 'HELPFUL', createdAt: previousDayInteraction },
        { userId: actors[2].id, lId: anonymous.id, type: 'HELPFUL', createdAt: previousDayInteraction },
      ],
    });

    const first = h.expectShape(await sidebar(), feedSidebarResponseSchema);
    assert.equal(first.lOfTheDay.item.l.id, winner.id);
    assert.equal(first.lOfTheDay.item.interactionCount, 2);
    assert.equal(first.lOfTheDay.item.l.isAnonymous, false);
    assert.equal(first.lOfTheDay.selectedFor, todayStart.toISOString().slice(0, 10));
    assert.equal(first.lOfTheDay.window.endsAt, todayStart.toISOString());

    const lateContender = await h.createL(author.id);
    await h.ctx.prisma.reaction.createMany({
      data: actors.map((actor) => ({
        userId: actor.id,
        lId: lateContender.id,
        type: 'BEEN_THERE',
        createdAt: previousDayInteraction,
      })),
    });

    const second = h.expectShape(await sidebar(), feedSidebarResponseSchema);
    assert.equal(second.lOfTheDay.item.l.id, winner.id, 'winner stays fixed for the UTC day');
    assert.ok(
      second.topLs.items.every((item) => item.l.id !== winner.id),
      'daily winner is deduplicated from Top Ls',
    );

    await h.ctx.prisma.l.update({
      where: { id: winner.id },
      data: { visibility: 'PRIVATE' },
    });
    const reselection = h.expectShape(await sidebar(), feedSidebarResponseSchema);
    assert.equal(
      reselection.lOfTheDay.item.l.id,
      lateContender.id,
      'an ineligible snapshot is deterministically replaced from the same closed window',
    );
  });
});
