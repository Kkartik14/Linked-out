'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const h = require('../_harness.cjs');

function planRoot(rows) {
  return rows[0]['QUERY PLAN'][0].Plan;
}

function planNodes(plan) {
  return [plan, ...(plan.Plans ?? []).flatMap(planNodes)];
}

async function explain(tx, sql) {
  return planRoot(await tx.$queryRawUnsafe(`EXPLAIN (FORMAT JSON) ${sql}`));
}

async function proveCandidate(tx, probe) {
  await tx.$executeRawUnsafe(probe.createTable);
  await tx.$executeRawUnsafe(probe.seed);
  await tx.$executeRawUnsafe(probe.existingIndex);
  await tx.$executeRawUnsafe(`ANALYZE ${probe.table}`);

  const before = await explain(tx, probe.query);
  assert.ok(
    planNodes(before).some(({ 'Node Type': nodeType }) => /Sort$/.test(nodeType)),
    `${probe.name}: the previous index should require a sort`,
  );

  await tx.$executeRawUnsafe(probe.candidateIndex);
  await tx.$executeRawUnsafe(`ANALYZE ${probe.table}`);
  const after = await explain(tx, probe.query);
  const nodes = planNodes(after);
  assert.ok(
    nodes.some(({ 'Index Name': indexName }) => indexName === probe.candidateName),
    `${probe.name}: planner did not select ${probe.candidateName}`,
  );
  assert.equal(
    nodes.some(({ 'Node Type': nodeType }) => /Sort$/.test(nodeType)),
    false,
    `${probe.name}: candidate should satisfy the complete keyset order`,
  );
}

describe('27 · production-shaped keyset query plans', () => {
  test('deployed keyset indexes are live, ready, valid, and have the expected definitions', async () => {
    const expected = new Map([
      ['L_authorId_id_idx', 'CREATE INDEX "L_authorId_id_idx" ON public."L" USING btree ("authorId", id DESC)'],
      ['Reaction_userId_type_id_idx', 'CREATE INDEX "Reaction_userId_type_id_idx" ON public."Reaction" USING btree ("userId", type, id DESC)'],
      ['Collection_ownerId_id_idx', 'CREATE INDEX "Collection_ownerId_id_idx" ON public."Collection" USING btree ("ownerId", id DESC)'],
      ['Notification_recipientId_createdAt_id_idx', 'CREATE INDEX "Notification_recipientId_createdAt_id_idx" ON public."Notification" USING btree ("recipientId", "createdAt" DESC, id DESC)'],
    ]);
    const rows = await h.ctx.prisma.$queryRawUnsafe(`
      SELECT index_class.relname AS name,
             index_state.indisvalid AS valid,
             index_state.indisready AS ready,
             index_state.indislive AS live,
             pg_get_indexdef(index_state.indexrelid) AS definition
      FROM pg_index index_state
      JOIN pg_class index_class ON index_class.oid = index_state.indexrelid
      WHERE index_class.relname = ANY($1)
      ORDER BY index_class.relname
    `, [...expected.keys()]);

    assert.equal(rows.length, expected.size);
    for (const row of rows) {
      assert.deepEqual(
        { valid: row.valid, ready: row.ready, live: row.live, definition: row.definition },
        { valid: true, ready: true, live: true, definition: expected.get(row.name) },
        row.name,
      );
    }
  });

  test('measured page indexes remove high-cardinality sorts on PostgreSQL', async () => {
    const probes = [
      {
        name: 'Ls by author',
        table: 'probe_l',
        createTable:
          'CREATE TEMP TABLE probe_l ("authorId" text NOT NULL, id text NOT NULL, "createdAt" timestamp NOT NULL) ON COMMIT DROP',
        seed:
          "INSERT INTO probe_l SELECT 'author-'||(g%100), lpad(g::text,12,'0'), timestamp '2026-01-01'+((g%10000)||' seconds')::interval FROM generate_series(1,100000) g",
        existingIndex:
          'CREATE INDEX probe_l_existing ON probe_l ("authorId", "createdAt" DESC)',
        candidateIndex:
          'CREATE INDEX "L_authorId_id_idx" ON probe_l ("authorId", id DESC)',
        candidateName: 'L_authorId_id_idx',
        query: "SELECT id FROM probe_l WHERE \"authorId\"='author-0' ORDER BY id DESC LIMIT 21",
      },
      {
        name: 'saved Ls by viewer',
        table: 'probe_reaction',
        createTable:
          'CREATE TEMP TABLE probe_reaction ("userId" text NOT NULL, type text NOT NULL, id text NOT NULL) ON COMMIT DROP',
        seed:
          "INSERT INTO probe_reaction SELECT 'user-'||(g%100), CASE WHEN g%5=0 THEN 'SAVED' ELSE 'OTHER' END, lpad(g::text,12,'0') FROM generate_series(1,100000) g",
        existingIndex:
          'CREATE INDEX probe_reaction_existing ON probe_reaction ("userId", type)',
        candidateIndex:
          'CREATE INDEX "Reaction_userId_type_id_idx" ON probe_reaction ("userId", type, id DESC)',
        candidateName: 'Reaction_userId_type_id_idx',
        query:
          "SELECT id FROM probe_reaction WHERE \"userId\"='user-0' AND type='SAVED' ORDER BY id DESC LIMIT 21",
      },
      {
        name: 'collections by owner',
        table: 'probe_collection',
        createTable:
          'CREATE TEMP TABLE probe_collection ("ownerId" text NOT NULL, id text NOT NULL) ON COMMIT DROP',
        seed:
          "INSERT INTO probe_collection SELECT 'owner-'||(g%100), lpad(g::text,12,'0') FROM generate_series(1,100000) g",
        existingIndex: 'CREATE INDEX probe_collection_existing ON probe_collection ("ownerId")',
        candidateIndex:
          'CREATE INDEX "Collection_ownerId_id_idx" ON probe_collection ("ownerId", id DESC)',
        candidateName: 'Collection_ownerId_id_idx',
        query:
          "SELECT id FROM probe_collection WHERE \"ownerId\"='owner-0' ORDER BY id DESC LIMIT 21",
      },
      {
        name: 'notifications by recipient',
        table: 'probe_notification',
        createTable:
          'CREATE TEMP TABLE probe_notification ("recipientId" text NOT NULL, "createdAt" timestamp NOT NULL, id text NOT NULL) ON COMMIT DROP',
        seed:
          "INSERT INTO probe_notification SELECT 'recipient-'||(g%100), timestamp '2026-01-01'+((g%1000)||' seconds')::interval, lpad(g::text,12,'0') FROM generate_series(1,100000) g",
        existingIndex:
          'CREATE INDEX probe_notification_existing ON probe_notification ("recipientId", "createdAt" DESC)',
        candidateIndex:
          'CREATE INDEX "Notification_recipientId_createdAt_id_idx" ON probe_notification ("recipientId", "createdAt" DESC, id DESC)',
        candidateName: 'Notification_recipientId_createdAt_id_idx',
        query:
          "SELECT id FROM probe_notification WHERE \"recipientId\"='recipient-0' ORDER BY \"createdAt\" DESC, id DESC LIMIT 21",
      },
    ];

    await h.ctx.prisma.$transaction(
      async (tx) => {
        for (const probe of probes) await proveCandidate(tx, probe);
      },
      { timeout: 30_000 },
    );
  });
});
