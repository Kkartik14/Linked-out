-- C7: comment lists use keyset predicates and return the first 51 rows ordered by id:
--   top-level: lId = ? AND parentId IS NULL AND id > ? ORDER BY id
--   replies:   parentId = ? AND id > ? ORDER BY id
-- PostgreSQL 16.14 EXPLAIN (ANALYZE, BUFFERS) on an isolated 1.2m-row fixture changed
-- top-level pagination from a PK Index Scan filtering 4,991 rows (0.570ms, 107 buffers)
-- to an Index Only Scan (0.109ms, 55 buffers). Reply pagination changed from a
-- Bitmap Heap Scan + top-N sort over 1,000 rows (2.501ms, 1,003 buffers) to an
-- Index Only Scan (0.105ms, 56 buffers).

-- The composite index retains parentId as its left prefix, so the old equality-only
-- index is redundant while reply counts and foreign-key checks remain supported.
DROP INDEX "Comment_parentId_idx";
CREATE INDEX "Comment_parentId_id_idx" ON "Comment"("parentId", "id");

-- Only top-level comments participate in L comment pages; keep replies out of this index.
-- Prisma does not represent this partial-index predicate in schema.prisma, so it is owned
-- explicitly by this SQL migration.
CREATE INDEX "Comment_lId_id_top_level_idx"
  ON "Comment"("lId", "id")
  WHERE "parentId" IS NULL;
