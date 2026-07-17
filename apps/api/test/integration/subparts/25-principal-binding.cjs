'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');

const { PRINCIPAL_BINDING_HEADER } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const CREATE_BODY = {
  title: 'A mutation composed under one principal',
  story: 'It must never land under another principal after the session changes.',
};

describe('25 · mutation principal binding', () => {
  beforeEach(h.resetDb);

  test('a stale or missing render-time identity cannot mutate under the live credential', async () => {
    const [original, current] = await Promise.all([h.createUser(), h.createUser()]);

    const stale = await h.post('/ls', {
      cookie: current.cookie,
      headers: { [PRINCIPAL_BINDING_HEADER]: original.id },
      body: CREATE_BODY,
    });
    h.expectError(stale, 409, 'PRINCIPAL_MISMATCH');

    const missing = await h.post('/ls', {
      cookie: current.cookie,
      bindPrincipal: false,
      body: CREATE_BODY,
    });
    h.expectError(missing, 409, 'PRINCIPAL_MISMATCH');
    assert.equal(await h.ctx.prisma.l.count(), 0);

    const bound = await h.post('/ls', { cookie: current.cookie, body: CREATE_BODY });
    assert.equal(bound.status, 201);
    assert.equal(bound.body.author.id, current.id);
  });

  test('the declaration is compared with an internal assertion principal too', async () => {
    const [original, current] = await Promise.all([h.createUser(), h.createUser()]);
    const stale = await h.post('/ls', {
      headers: {
        'x-internal-auth': h.internalAssertion(current),
        [PRINCIPAL_BINDING_HEADER]: original.id,
      },
      body: CREATE_BODY,
    });
    h.expectError(stale, 409, 'PRINCIPAL_MISMATCH');
    assert.equal(await h.ctx.prisma.l.count(), 0);

    const authoritative = await h.post('/ls', {
      cookie: original.cookie,
      headers: {
        'x-internal-auth': h.internalAssertion(current),
        [PRINCIPAL_BINDING_HEADER]: current.id,
      },
      body: CREATE_BODY,
    });
    assert.equal(authoritative.status, 201);
    assert.equal(authoritative.body.author.id, current.id);
  });
});
