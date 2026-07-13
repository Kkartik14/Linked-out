-- Reproduce the C7 comment-pagination index comparison against real PostgreSQL:
--
-- docker exec -i linkedout-postgres psql -U linkedout -d linkedout_test \
--   -X -v ON_ERROR_STOP=1 \
--   < apps/api/test/performance/comment-pagination-indexes.sql
--
-- The fixture is a session-local temporary table. It neither reads nor mutates application
-- rows. Its baseline indexes mirror the schema before migration 20260714100000.

\pset pager off
SET jit = off;

CREATE TEMP TABLE comment_bench (
  LIKE public."Comment" INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);
ALTER TABLE comment_bench ADD PRIMARY KEY ("id");
CREATE INDEX comment_bench_l_id_created_at_idx ON comment_bench("lId", "createdAt");
CREATE INDEX comment_bench_parent_id_idx ON comment_bench("parentId");

-- 600k top-level comments across 100 Ls (6k per L).
INSERT INTO comment_bench
  ("id", "body", "authorId", "lId", "parentId", "createdAt", "updatedAt")
SELECT
  'T' || lpad(gs::text, 25, '0'),
  'benchmark',
  'author',
  'L' || lpad((((gs - 1) % 100) + 1)::text, 25, '0'),
  NULL,
  TIMESTAMPTZ '2026-01-01 00:00:00+00',
  TIMESTAMPTZ '2026-01-01 00:00:00+00'
FROM generate_series(1, 600000) AS gs;

-- 600k replies across 600 parents (1k per parent).
INSERT INTO comment_bench
  ("id", "body", "authorId", "lId", "parentId", "createdAt", "updatedAt")
SELECT
  'R' || lpad(gs::text, 25, '0'),
  'benchmark',
  'author',
  'L' || lpad((((gs - 1) % 100) + 1)::text, 25, '0'),
  'P' || lpad((((gs - 1) % 600) + 1)::text, 25, '0'),
  TIMESTAMPTZ '2026-01-01 00:00:00+00',
  TIMESTAMPTZ '2026-01-01 00:00:00+00'
FROM generate_series(1, 600000) AS gs;

ANALYZE comment_bench;

\echo BASELINE_TOP_LEVEL
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id"
FROM comment_bench
WHERE "lId" = 'L0000000000000000000000042'
  AND "parentId" IS NULL
  AND "id" > 'T00000000000000000000300000'
ORDER BY "id" ASC
LIMIT 51;

\echo BASELINE_REPLIES
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id"
FROM comment_bench
WHERE "parentId" = 'P0000000000000000000000042'
  AND "id" > 'R00000000000000000000300000'
ORDER BY "id" ASC
LIMIT 51;

CREATE INDEX comment_bench_parent_id_id_idx ON comment_bench("parentId", "id");
CREATE INDEX comment_bench_l_id_id_top_level_idx
  ON comment_bench("lId", "id")
  WHERE "parentId" IS NULL;
ANALYZE comment_bench;

\echo CANDIDATE_TOP_LEVEL
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id"
FROM comment_bench
WHERE "lId" = 'L0000000000000000000000042'
  AND "parentId" IS NULL
  AND "id" > 'T00000000000000000000300000'
ORDER BY "id" ASC
LIMIT 51;

\echo CANDIDATE_REPLIES
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id"
FROM comment_bench
WHERE "parentId" = 'P0000000000000000000000042'
  AND "id" > 'R00000000000000000000300000'
ORDER BY "id" ASC
LIMIT 51;
