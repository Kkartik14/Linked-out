'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');
const {
  collectionDetailSchema,
  journeyNodeSchema,
  lCardSchema,
  lDetailSchema,
  metaEnumsResponseSchema,
  paginatedSchema,
} = require('@linkedout/contracts/v2');

const h = require('../_harness.cjs');

const LEGACY_L_KEYS = ['category', 'company', 'tags', 'eventDate'];
const lPageSchema = paginatedSchema(lCardSchema);
const journeyPageSchema = paginatedSchema(journeyNodeSchema);

function v2(method, path, options = {}) {
  return h.request(method, path, { ...options, baseUrl: h.ctx.v2BaseUrl });
}

function assertCleanL(value) {
  for (const key of LEGACY_L_KEYS) {
    assert.equal(key in value, false, `v2 L must not expose legacy key ${key}`);
  }
}

describe('22 · clean category-free v2 L surfaces', () => {
  let author;

  beforeEach(async () => {
    await h.resetDb();
    author = await h.createUser({ username: 'author', name: 'Real Author' });
  });

  test('create, detail, and update use the strict clean L contract', async () => {
    const createdResponse = await v2('POST', '/ls', {
      cookie: author.cookie,
      body: { title: 'A clean L', story: 'No legacy concepts on the wire.' },
    });
    const created = h.expectShape(createdResponse, lDetailSchema, 201);
    assertCleanL(createdResponse.body);
    assert.equal(created.title, 'A clean L');

    const stored = await h.ctx.prisma.l.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(stored.category, null);
    assert.equal(stored.company, null);
    assert.deepEqual(stored.tags, []);
    assert.equal(stored.eventDate, null);

    const legacy = await v2('POST', '/ls', {
      cookie: author.cookie,
      body: { title: 'Old shape', story: 'Must fail.', category: 'CAREER' },
    });
    h.expectError(legacy, 400, 'VALIDATION_ERROR');

    const updatedResponse = await v2('PATCH', `/ls/${created.id}`, {
      cookie: author.cookie,
      body: { title: 'Updated cleanly', resolvedAt: new Date().toISOString() },
    });
    const updated = h.expectShape(updatedResponse, lDetailSchema);
    assertCleanL(updatedResponse.body);
    assert.equal(updated.title, 'Updated cleanly');
    assert.equal(updated.resolvedAt, null, 'resolvedAt is meaningful only for BATTLE');

    const detailResponse = await v2('GET', `/ls/${created.id}`);
    h.expectShape(detailResponse, lDetailSchema);
    assertCleanL(detailResponse.body);
  });

  test('feed and saved-list cards omit legacy fields and reject category filters', async () => {
    const l = await h.createL(author.id, {
      title: 'Legacy data, clean response',
      category: 'CAREER',
      company: 'Acme',
      tags: ['legacy'],
      eventDate: new Date('2020-01-01T00:00:00.000Z'),
    });

    const feedResponse = await v2('GET', '/feed');
    const feed = h.expectShape(feedResponse, lPageSchema);
    assert.equal(feed.data[0].id, l.id);
    assertCleanL(feedResponse.body.data[0]);
    h.expectError(await v2('GET', '/feed?filter=career'), 400, 'VALIDATION_ERROR');

    await h.ctx.prisma.reaction.create({
      data: { userId: author.id, lId: l.id, type: 'SAVED' },
    });
    const savedResponse = await v2('GET', '/me/saved', { cookie: author.cookie });
    const saved = h.expectShape(savedResponse, lPageSchema);
    assert.equal(saved.data[0].id, l.id);
    assertCleanL(savedResponse.body.data[0]);
  });

  test('user Ls and journey use clean cards and createdAt ordering', async () => {
    const later = await h.createL(author.id, {
      title: 'Published later',
      eventDate: new Date('2019-01-01T00:00:00.000Z'),
    });
    const earlier = await h.createL(author.id, {
      title: 'Published earlier',
      eventDate: new Date('2030-01-01T00:00:00.000Z'),
    });
    await h.ctx.prisma.l.update({
      where: { id: earlier.id },
      data: { createdAt: new Date('2025-01-01T00:00:00.000Z') },
    });
    await h.ctx.prisma.l.update({
      where: { id: later.id },
      data: { createdAt: new Date('2025-01-02T00:00:00.000Z') },
    });

    const lsResponse = await v2('GET', '/users/author/ls');
    h.expectShape(lsResponse, lPageSchema);
    lsResponse.body.data.forEach(assertCleanL);

    const journeyResponse = await v2('GET', '/users/author/journey');
    const journey = h.expectShape(journeyResponse, journeyPageSchema);
    assert.deepEqual(journey.data.map((node) => node.id), [earlier.id, later.id]);
    assert.deepEqual(
      journey.data.map((node) => node.createdAt),
      ['2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z'],
    );
    assert.equal('date' in journeyResponse.body.data[0], false);
  });

  test('search is category-free and returns clean L cards', async () => {
    const l = await h.createL(author.id, {
      title: 'Searchable production lesson',
      category: 'PRODUCTION',
      company: 'Acme',
    });

    const response = await v2('GET', '/search?q=production');
    const page = h.expectShape(response, lPageSchema);
    assert.equal(page.data[0].id, l.id);
    assertCleanL(response.body.data[0]);
    h.expectError(
      await v2('GET', '/search?q=production&filter=production'),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('collection details contain clean cards on reads and membership mutations', async () => {
    const l = await h.createL(author.id, { category: 'STARTUPS', company: 'Acme' });
    const collection = await h.ctx.prisma.collection.create({
      data: { ownerId: author.id, title: 'Build log', slug: 'build-log' },
    });

    const addedResponse = await v2('PUT', `/collections/${collection.id}/ls/${l.id}`, {
      cookie: author.cookie,
      body: {},
    });
    const added = h.expectShape(addedResponse, collectionDetailSchema);
    assert.equal(added.ls[0].id, l.id);
    assertCleanL(addedResponse.body.ls[0]);

    const detailResponse = await v2('GET', `/collections/${collection.id}`);
    h.expectShape(detailResponse, collectionDetailSchema);
    assertCleanL(detailResponse.body.ls[0]);
  });

  test('enum metadata omits categories and popular tags have no v2 route', async () => {
    const response = await v2('GET', '/meta/enums');
    const metadata = h.expectShape(response, metaEnumsResponseSchema);
    assert.equal('lCategory' in response.body, false);
    assert.ok(metadata.lType.length > 0);

    h.expectError(await v2('GET', '/tags/popular'), 404, 'NOT_FOUND');
  });

  test('malformed v2 route parameters are rejected by contract validation', async () => {
    for (const response of [
      await v2('GET', '/ls/not-a-ulid'),
      await v2('GET', '/collections/not-a-ulid'),
      await v2('GET', '/users/INVALID!/ls'),
    ]) {
      h.expectError(response, 400, 'VALIDATION_ERROR');
    }
  });

  test('v2 carries every unchanged v1 operation in its live OpenAPI surface', async () => {
    const [v1Document, v2Document, authMe, profile] = await Promise.all([
      h.get('/openapi.json'),
      v2('GET', '/openapi.json'),
      v2('GET', '/auth/me'),
      v2('GET', '/users/author'),
    ]);
    assert.equal(v1Document.status, 200);
    assert.equal(v2Document.status, 200);
    assert.deepEqual(authMe.body, { user: null, needsOnboarding: false });
    assert.equal(profile.body.id, author.id);

    const operations = (document) =>
      Object.entries(document.paths).flatMap(([path, item]) =>
        Object.keys(item)
          .filter((method) => ['delete', 'get', 'patch', 'post', 'put'].includes(method))
          .map((method) => `${method} ${path}`),
      );
    assert.deepEqual(
      operations(v2Document.body).sort(),
      [
        ...operations(v1Document.body).filter((operation) => operation !== 'get /tags/popular'),
        'get /feed/sidebar',
      ].sort(),
    );
  });
});
