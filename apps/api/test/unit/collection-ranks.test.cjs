'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CollectionsRepository,
} = require('../../dist/modules/collections/collections.repository');

test('exceptional collection rank repair is one set-based database statement', async () => {
  const statements = [];
  let rankReads = 0;
  let upsert;
  const transaction = {
    async $queryRaw() {
      return [{ id: 'collection-1' }];
    },
    collectionL: {
      async findUnique() {
        return null;
      },
      async count() {
        return 2;
      },
      async findMany(args) {
        assert.equal(args.take, 2, 'rank repair must not materialize every collection member');
        rankReads += 1;
        return rankReads === 1 ? [{ position: 0 }, { position: 1 }] : [{ position: 0 }, { position: 1024 }];
      },
      async upsert(args) {
        upsert = args;
        return { lId: 'l-3' };
      },
    },
    async $executeRaw(strings, ...values) {
      statements.push({ sql: strings.join('?'), values });
      return 42;
    },
  };
  const repository = new CollectionsRepository({
    db: { $transaction: async (operation) => operation(transaction) },
  });

  await repository.addL('collection-1', 'l-3', 1);

  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /ROW_NUMBER\(\) OVER/i);
  assert.match(statements[0].sql, /UPDATE "CollectionL"/i);
  assert.deepEqual(statements[0].values, [1024, 'collection-1']);
  assert.equal(upsert.create.position, 512);
  assert.equal(upsert.update.position, 512);
});
