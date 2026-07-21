'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { lCardSchema, userSummarySchema, paginatedSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const lsSchema = paginatedSchema(lCardSchema);
const usersSchema = paginatedSchema(userSummarySchema);

describe('12 · search (contract §4.10)', () => {
  let author;
  let viewer;

  beforeEach(async () => {
    await h.resetDb();
    author = await h.createUser({ username: 'kartik', name: 'Kartik Gupta' });
    viewer = await h.createUser({ username: 'viewer', name: 'Nadia Ray' });
  });

  test('q is required and bounded to 1..100 characters', async () => {
    h.expectError(await h.get('/search'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/search?q='), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get(`/search?q=${'x'.repeat(101)}`), 400, 'VALIDATION_ERROR');
    h.expectShape(await h.get(`/search?q=${'x'.repeat(100)}`), lsSchema);
  });

  test('defaults to type=ls and returns the paginated LCard envelope', async () => {
    await h.createL(author.id, { title: 'Failed Google interview' });
    const res = await h.get('/search?q=google');
    const page = h.expectShape(res, lsSchema);
    assert.equal(page.data.length, 1);
  });

  test('an unmatched query is an empty page, not a 404', async () => {
    await h.createL(author.id, { title: 'Something else' });
    const res = await h.get('/search?q=zzzznonexistent');
    const page = h.expectShape(res, lsSchema);
    assert.deepEqual(page.data, []);
    assert.equal(page.nextCursor, null);
  });

  test('matches on both title and story', async () => {
    const byTitle = await h.createL(author.id, { title: 'Burnout', story: 'unrelated words' });
    const byStory = await h.createL(author.id, { title: 'unrelated', story: 'I hit burnout hard.' });

    const res = await h.get('/search?q=burnout');
    const returned = res.body.data.map((c) => c.id).sort();
    assert.deepEqual(returned, [byTitle.id, byStory.id].sort());
  });

  test('matches an unfinished final token from its first character', async () => {
    const running = await h.createL(author.id, {
      title: 'Running a careful migration',
      story: 'The rollout remained uneventful.',
    });
    await h.createL(author.id, { title: 'A careful roadmap' });

    for (const q of ['r', 'ru']) {
      const page = h.expectShape(await h.get(`/search?q=${encodeURIComponent(q)}`), lsSchema);
      assert.ok(page.data.some((l) => l.id === running.id), `q=${q}`);
    }

    for (const q of ['runn', 'running m', 'running migr']) {
      const page = h.expectShape(await h.get(`/search?q=${encodeURIComponent(q)}`), lsSchema);
      assert.deepEqual(page.data.map((l) => l.id), [running.id], `q=${q}`);
    }
  });

  test('prefix search keeps title matches above story-only matches', async () => {
    const storyOnly = await h.createL(author.id, {
      title: 'A quiet week',
      story: 'We carefully migrated the production database.',
    });
    const titleMatch = await h.createL(author.id, {
      title: 'Migration playbook',
      story: 'Nothing else to say.',
    });

    const res = await h.get('/search?q=migr');
    assert.deepEqual(res.body.data.map((l) => l.id), [titleMatch.id, storyOnly.id]);
  });

  test('ranks title matches above story-only matches', async () => {
    const storyOnly = await h.createL(author.id, {
      title: 'A quiet week',
      story: 'We had a production outage on Friday.',
    });
    const titleMatch = await h.createL(author.id, {
      title: 'Production outage',
      story: 'Nothing else to say.',
    });

    const res = await h.get('/search?q=production outage');
    assert.deepEqual(
      res.body.data.map((c) => c.id),
      [titleMatch.id, storyOnly.id],
      'title weight (A) must outrank story weight (B)',
    );
  });

  test('only visible Ls are searchable', async () => {
    const pub = await h.createL(author.id, { title: 'searchable layoff', visibility: 'PUBLIC' });
    const priv = await h.createL(author.id, { title: 'searchable layoff', visibility: 'PRIVATE' });
    const followersOnly = await h.createL(author.id, {
      title: 'searchable layoff',
      visibility: 'FOLLOWERS',
    });

    const anon = await h.get('/search?q=layoff');
    assert.deepEqual(anon.body.data.map((c) => c.id), [pub.id]);

    const stranger = await h.get('/search?q=layoff', { cookie: viewer.cookie });
    assert.deepEqual(stranger.body.data.map((c) => c.id), [pub.id]);

    const owner = await h.get('/search?q=layoff', { cookie: author.cookie });
    assert.equal(owner.body.data.length, 3, 'the author sees their own private + followers Ls');
    void priv;

    await h.follow(viewer.id, author.id);
    const follower = await h.get('/search?q=layoff', { cookie: viewer.cookie });
    assert.deepEqual(
      follower.body.data.map((c) => c.id).sort(),
      [pub.id, followersOnly.id].sort(),
    );
  });

  test('rejects removed filters or an unknown type', async () => {
    h.expectError(await h.get('/search?q=x&filter=nope'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/search?q=x&filter=INTERVIEWS'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/search?q=x&type=posts'), 400, 'VALIDATION_ERROR');
  });

  test('rejects misspelled and incompatible discriminators instead of changing search kind', async () => {
    h.expectError(await h.get('/search?q=kartik&tyep=users'), 400, 'VALIDATION_ERROR');
    const res = await h.get('/search?q=kartik&type=users&filter=interviews');
    h.expectError(res, 400, 'VALIDATION_ERROR');
  });

  test('type=users searches username and display name', async () => {
    const byUsername = await h.get('/search?q=kartik&type=users');
    assert.deepEqual(h.expectShape(byUsername, usersSchema).data.map((u) => u.username), ['kartik']);

    const byName = await h.get('/search?q=Nadia&type=users');
    assert.deepEqual(h.expectShape(byName, usersSchema).data.map((u) => u.username), ['viewer']);
  });

  test('user search matches a substring, case-insensitively', async () => {
    const res = await h.get('/search?q=ARTI&type=users');
    assert.deepEqual(res.body.data.map((u) => u.username), ['kartik']);
  });

  test('user search never returns users who have not onboarded', async () => {
    await h.createOnboardingUser({ name: 'Ghostly Person' });
    const res = await h.get('/search?q=Ghostly&type=users');
    assert.deepEqual(res.body.data, [], 'users without a username are not discoverable');
  });

  test('search never leaks an anonymous L’s author', async () => {
    await h.createL(author.id, { title: 'anonymous burnout story', isAnonymous: true });
    const res = await h.get('/search?q=burnout');
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].author, null);
  });

  test('ls search paginates through every match exactly once', async () => {
    for (let i = 0; i < 7; i += 1) {
      await h.createL(author.id, { title: `pagination probe ${i}` });
    }

    const seen = [];
    let cursor;
    let guard = 0;
    do {
      const q = `/search?q=probe&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = h.expectShape(await h.get(q), lsSchema);
      seen.push(...page.data.map((c) => c.id));
      cursor = page.nextCursor;
      guard += 1;
      assert.ok(guard < 10, 'pagination must terminate');
    } while (cursor);

    assert.equal(seen.length, 7);
    assert.equal(new Set(seen).size, 7, 'no duplicates across ranked pages');
  });

  test('user search uses a stable keyset when rows are inserted before the cursor', async () => {
    for (let i = 1; i <= 4; i += 1) await h.createUser({ username: `probe${i}` });

    const first = h.expectShape(await h.get('/search?q=probe&type=users&limit=2'), usersSchema);
    assert.deepEqual(first.data.map((user) => user.username), ['probe1', 'probe2']);
    assert.ok(first.nextCursor);

    // An offset cursor would now return probe2 again after this insertion shifts the rows.
    await h.createUser({ username: 'probe0' });

    const second = h.expectShape(
      await h.get(`/search?q=probe&type=users&limit=2&cursor=${encodeURIComponent(first.nextCursor)}`),
      usersSchema,
    );
    assert.deepEqual(second.data.map((user) => user.username), ['probe3', 'probe4']);
    assert.equal(second.nextCursor, null);
  });

  test('user search treats percent, underscore and backslash as literal text', async () => {
    await h.createUser({ username: 'percenthit', name: '100% Builder' });
    await h.createUser({ username: 'percentmiss', name: '1000 Builder' });
    await h.createUser({ username: 'underhit', name: 'Under_score' });
    await h.createUser({ username: 'undermiss', name: 'UnderXscore' });
    await h.createUser({ username: 'slashhit', name: 'Path\\Builder' });
    await h.createUser({ username: 'slashmiss', name: 'Path Builder' });

    const usernamesFor = async (q) => {
      const path = `/search?q=${encodeURIComponent(q)}&type=users`;
      return h.expectShape(await h.get(path), usersSchema).data.map((user) => user.username);
    };

    assert.deepEqual(await usernamesFor('%'), ['percenthit']);
    assert.deepEqual(await usernamesFor('_'), ['underhit']);
    assert.deepEqual(await usernamesFor('\\'), ['slashhit']);
  });

  test('a malformed search cursor is 400 BAD_CURSOR', async () => {
    h.expectError(await h.get('/search?q=x&cursor=!!!'), 400, 'BAD_CURSOR');
    h.expectError(await h.get(`/search?q=x&cursor=${btoa('{"offset":"nope"}')}`), 400, 'BAD_CURSOR');
    h.expectError(
      await h.get(`/search?q=x&type=users&cursor=${btoa('{"offset":-5}')}`),
      400,
      'BAD_CURSOR',
    );
  });

  test('search survives hostile query strings without a 500', async () => {
    await h.createL(author.id, { title: 'ordinary' });
    for (const q of ['"unbalanced', '&|!', "' OR 1=1 --", '<script>', 'a & b', ':*', '\\']) {
      const res = await h.get(`/search?q=${encodeURIComponent(q)}`);
      assert.equal(res.status, 200, `q=${q} should not error, got ${res.status}`);
      h.expectShape(res, lsSchema);
    }
  });

  test('a stopword prefix searches source text instead of broadening to everything', async () => {
    const expected = await h.createL(author.id, { title: 'the story' });
    await h.createL(author.id, { title: 'unrelated words', story: 'A plain account.' });
    const res = await h.get('/search?q=the');
    h.expectShape(res, lsSchema);
    assert.deepEqual(res.body.data.map((l) => l.id), [expected.id]);
  });

  test('search results carry viewer context', async () => {
    const l = await h.createL(author.id, { title: 'reactive story' });
    await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: viewer.cookie });

    const res = await h.get('/search?q=reactive', { cookie: viewer.cookie });
    assert.deepEqual(res.body.data[0].viewer.reactions, ['HELPFUL']);
    assert.equal(res.body.data[0].viewer.canEdit, false);
  });
});
