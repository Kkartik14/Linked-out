'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');
const {
  collectionDetailSchema,
  lCardSchema,
  lDetailSchema,
  metaEnumsResponseSchema,
  paginatedSchema,
} = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const REMOVED_L_KEYS = ['category', 'company', 'tags', 'eventDate'];
const lPageSchema = paginatedSchema(lCardSchema);

function assertCleanL(value) {
  for (const key of REMOVED_L_KEYS) {
    assert.equal(key in value, false, `public L must not expose removed key ${key}`);
  }
}

describe('22 · consolidated public API', () => {
  let author;

  beforeEach(async () => {
    await h.resetDb();
    author = await h.createUser({ username: 'author', name: 'Real Author' });
  });

  test('create, detail, and update use the strict clean L contract', async () => {
    const createdResponse = await h.post('/ls', {
      cookie: author.cookie,
      body: { title: 'A clean L', story: 'No removed concepts on the wire.' },
    });
    const created = h.expectShape(createdResponse, lDetailSchema, 201);
    assertCleanL(createdResponse.body);

    const stored = await h.ctx.prisma.l.findUniqueOrThrow({ where: { id: created.id } });
    for (const key of REMOVED_L_KEYS) assert.equal(Object.hasOwn(stored, key), false);

    h.expectError(
      await h.post('/ls', {
        cookie: author.cookie,
        body: { title: 'Old shape', story: 'Must fail.', category: 'CAREER' },
      }),
      400,
      'VALIDATION_ERROR',
    );

    const updatedResponse = await h.patch(`/ls/${created.id}`, {
      cookie: author.cookie,
      body: { title: 'Updated cleanly', resolvedAt: new Date().toISOString() },
    });
    const updated = h.expectShape(updatedResponse, lDetailSchema);
    assertCleanL(updated);
    assert.equal(updated.resolvedAt, null, 'resolvedAt is meaningful only for BATTLE');

    assertCleanL(h.expectShape(await h.get(`/ls/${created.id}`), lDetailSchema));
  });

  test('feed, saved, search, and collection surfaces return clean cards', async () => {
    const l = await h.createL(author.id, { title: 'Searchable production lesson' });
    assertCleanL(h.expectShape(await h.get('/feed'), lPageSchema).data[0]);
    h.expectError(await h.get('/feed?filter=career'), 400, 'VALIDATION_ERROR');

    await h.ctx.prisma.reaction.create({
      data: { userId: author.id, lId: l.id, type: 'SAVED' },
    });
    assertCleanL(
      h.expectShape(await h.get('/me/saved', { cookie: author.cookie }), lPageSchema).data[0],
    );

    const search = h.expectShape(await h.get('/search?q=production'), lPageSchema);
    assert.equal(search.data[0].id, l.id);
    assertCleanL(search.data[0]);
    h.expectError(await h.get('/search?q=production&filter=production'), 400, 'VALIDATION_ERROR');

    const collection = await h.ctx.prisma.collection.create({
      data: { ownerId: author.id, title: 'Build log', slug: 'build-log' },
    });
    const added = h.expectShape(
      await h.put(`/collections/${collection.id}/ls/${l.id}`, {
        cookie: author.cookie,
        body: {},
      }),
      collectionDetailSchema,
    );
    assertCleanL(added.ls[0]);
    assertCleanL(
      h.expectShape(await h.get(`/collections/${collection.id}`), collectionDetailSchema).ls[0],
    );
  });

  test('user Ls are clean and the removed journey route is unavailable', async () => {
    await h.createL(author.id, { title: 'A profile L' });
    h.expectShape(await h.get('/users/author/ls'), lPageSchema).data.forEach(assertCleanL);
    h.expectError(await h.get('/users/author/journey'), 404, 'NOT_FOUND');
  });

  test('metadata and OpenAPI expose only the consolidated v1 surface', async () => {
    const metadata = h.expectShape(await h.get('/meta/enums'), metaEnumsResponseSchema);
    assert.equal('lCategory' in metadata, false);
    h.expectError(await h.get('/tags/popular'), 404, 'NOT_FOUND');

    const document = (await h.get('/openapi.json')).body;
    assert.deepEqual(document.servers, [{ url: '/v1' }]);
    assert.ok(document.paths['/feed/sidebar']);
    assert.equal(document.paths['/tags/popular'], undefined);
    assert.equal(document.paths['/users/{username}/journey'], undefined);

  });

  test('malformed route parameters are rejected by contract validation', async () => {
    for (const response of [
      await h.get('/ls/not-a-ulid'),
      await h.get('/collections/not-a-ulid'),
      await h.get('/users/INVALID!/ls'),
    ]) {
      h.expectError(response, 400, 'VALIDATION_ERROR');
    }
  });
});
