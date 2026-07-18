'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');
const { feedSidebarResponseSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

function sidebar(cookie) {
  return h.get('/feed/sidebar', { cookie });
}

describe('21 · GET /v1/feed/sidebar', () => {
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
    h.expectError(await h.get('/feed/sidebar?filter=career'), 400, 'VALIDATION_ERROR');

    // Seed real candidates first. Against the freshly reset database the only user is the
    // viewer itself, which is never its own suggestion — so `items` is `[]`, and every
    // `.every()` below would hold no matter what the server put in `canFollow`.
    const actor = await h.createUser({ username: 'actor' });
    for (const username of ['builder_one', 'builder_two']) {
      const candidate = await h.createUser({ username });
      const l = await h.createL(candidate.id, { isAnonymous: false, visibility: 'PUBLIC' });
      await h.ctx.prisma.reaction.create({
        data: { userId: actor.id, lId: l.id, type: 'HELPFUL' },
      });
    }

    const onboarding = await h.createOnboardingUser();
    const body = h.expectShape(await sidebar(onboarding.cookie), feedSidebarResponseSchema);
    assert.equal(body.viewer.state, 'ONBOARDING_REQUIRED');
    assert.equal(body.viewer.profile.id, onboarding.id);
    assert.equal(body.peopleToFollow.personalized, false);
    assert.deepEqual(
      body.peopleToFollow.items.map((item) => item.user.username).sort(),
      ['builder_one', 'builder_two'],
      'the global fallback returns candidates, so the canFollow assertion below is not vacuous',
    );
    assert.ok(
      body.peopleToFollow.items.every((item) => !item.viewer.canFollow),
      'a viewer who has not onboarded cannot follow anyone yet',
    );
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

  test('deleting a fresh daily winner immediately selects the eligible runner-up', async () => {
    const author = await h.createUser({ username: 'author' });
    const firstActor = await h.createUser({ username: 'first_actor' });
    const secondActor = await h.createUser({ username: 'second_actor' });
    const winner = await h.createL(author.id);
    const runnerUp = await h.createL(author.id);
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const previousDayInteraction = new Date(todayStart.getTime() - 1);

    await h.ctx.prisma.reaction.createMany({
      data: [
        {
          userId: firstActor.id,
          lId: winner.id,
          type: 'HELPFUL',
          createdAt: previousDayInteraction,
        },
        {
          userId: secondActor.id,
          lId: winner.id,
          type: 'RESPECT',
          createdAt: previousDayInteraction,
        },
        {
          userId: firstActor.id,
          lId: runnerUp.id,
          type: 'HELPFUL',
          createdAt: previousDayInteraction,
        },
      ],
    });

    const selected = h.expectShape(await sidebar(), feedSidebarResponseSchema);
    assert.equal(selected.lOfTheDay.item.l.id, winner.id);
    await h.ctx.prisma.l.delete({ where: { id: winner.id } });

    const replaced = h.expectShape(await sidebar(), feedSidebarResponseSchema);
    assert.equal(replaced.lOfTheDay.item.l.id, runnerUp.id);
  });

  // The ranking tests above all give each L a distinct interactionCount, so the count alone
  // decides the order and the documented tie-breaks never run. These pin the tie-breaks by
  // holding the count equal across every candidate.
  test('Top Ls break a tie on distinct HELPFUL reactors, then distinct commenters', async () => {
    const author = await h.createUser({ username: 'author' });
    const actorOne = await h.createUser({ username: 'actor_one' });
    const actorTwo = await h.createUser({ username: 'actor_two' });

    const twoHelpful = await h.createL(author.id, { title: 'two helpful reactors' });
    const helpfulAndComment = await h.createL(author.id, { title: 'one helpful, one commenter' });
    const helpfulOnly = await h.createL(author.id, { title: 'one helpful, no commenter' });
    const noHelpful = await h.createL(author.id, { title: 'no helpful reactors' });

    await h.ctx.prisma.reaction.createMany({
      data: [
        { userId: actorOne.id, lId: twoHelpful.id, type: 'HELPFUL' },
        { userId: actorTwo.id, lId: twoHelpful.id, type: 'HELPFUL' },
        { userId: actorOne.id, lId: helpfulAndComment.id, type: 'HELPFUL' },
        { userId: actorOne.id, lId: helpfulOnly.id, type: 'HELPFUL' },
        { userId: actorTwo.id, lId: helpfulOnly.id, type: 'BEEN_THERE' },
        { userId: actorOne.id, lId: noHelpful.id, type: 'BEEN_THERE' },
        { userId: actorTwo.id, lId: noHelpful.id, type: 'BEEN_THERE' },
      ],
    });
    await h.ctx.prisma.comment.create({
      data: { authorId: actorTwo.id, lId: helpfulAndComment.id, body: 'the second actor' },
    });

    const body = h.expectShape(await sidebar(), feedSidebarResponseSchema);
    assert.ok(
      body.topLs.items.every((item) => item.interactionCount === 2),
      'every candidate must tie on interactionCount, or the tie-break is not what ordered them',
    );
    assert.deepEqual(
      body.topLs.items.map((item) => item.l.id),
      [twoHelpful.id, helpfulAndComment.id, helpfulOnly.id, noHelpful.id],
    );
  });

  test('Top Ls fall back to ascending L id once every tie-break is equal', async () => {
    const author = await h.createUser({ username: 'author' });
    const actor = await h.createUser({ username: 'actor' });

    // Identical in every ranked dimension: same count, same HELPFUL reactors, no commenters.
    const ids = [];
    for (const title of ['first', 'second', 'third']) {
      const l = await h.createL(author.id, { title });
      await h.ctx.prisma.reaction.create({
        data: { userId: actor.id, lId: l.id, type: 'HELPFUL' },
      });
      ids.push(l.id);
    }

    const body = h.expectShape(await sidebar(), feedSidebarResponseSchema);
    assert.deepEqual(
      body.topLs.items.map((item) => item.l.id),
      ids.slice().sort(),
      'a full tie is ordered by L id ascending',
    );
  });

  test('Top Ls report a rolling seven-day window and ignore interactions outside it', async () => {
    const author = await h.createUser({ username: 'author' });
    const actor = await h.createUser({ username: 'actor' });
    const inWindow = await h.createL(author.id, { title: 'interacted with recently' });
    const tooOld = await h.createL(author.id, { title: 'interacted with eight days ago' });

    await h.ctx.prisma.reaction.createMany({
      data: [
        { userId: actor.id, lId: inWindow.id, type: 'HELPFUL' },
        {
          userId: actor.id,
          lId: tooOld.id,
          type: 'HELPFUL',
          createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1_000),
        },
      ],
    });

    const body = h.expectShape(await sidebar(), feedSidebarResponseSchema);
    assert.deepEqual(
      body.topLs.items.map((item) => item.l.id),
      [inWindow.id],
      'an interaction older than the window does not make its L eligible',
    );
    assert.equal(body.topLs.window.endsAt, body.generatedAt, 'the window ends at generatedAt');
    assert.equal(body.topLs.windowLabel, 'Past 7 days');
    assert.equal(
      Date.parse(body.topLs.window.endsAt) - Date.parse(body.topLs.window.startsAt),
      7 * 24 * 60 * 60 * 1_000,
      'the window is exactly seven days',
    );
  });

  test('Top Ls return at most five unique items, keeping the highest ranked', async () => {
    const author = await h.createUser({ username: 'author' });
    const actors = [];
    for (let index = 0; index < 7; index += 1) {
      actors.push(await h.createUser({ username: `actor_${index}` }));
    }

    // Seven eligible Ls with strictly descending interaction counts: 7, 6, 5 … 1.
    const ordered = [];
    for (let rank = 0; rank < 7; rank += 1) {
      const l = await h.createL(author.id, { title: `rank ${rank}` });
      await h.ctx.prisma.reaction.createMany({
        data: actors.slice(0, 7 - rank).map((actor) => ({
          userId: actor.id,
          lId: l.id,
          type: 'HELPFUL',
        })),
      });
      ordered.push(l.id);
    }

    const body = h.expectShape(await sidebar(), feedSidebarResponseSchema);
    const returned = body.topLs.items.map((item) => item.l.id);
    assert.deepEqual(returned, ordered.slice(0, 5), 'the cap keeps the top five, not any five');
    assert.equal(new Set(returned).size, returned.length, 'ids are unique');
    assert.deepEqual(
      body.topLs.items.map((item) => item.interactionCount),
      [7, 6, 5, 4, 3],
    );
  });
});
