-- The score has no time decay, so it measures lifetime popularity rather than trends.
ALTER TABLE "L" RENAME COLUMN "trendingScore" TO "popularityScore";

-- C20: the longer (visibility, metric, id) indexes serve the same ORDER BY queries and
-- provide deterministic cursor tie-breaking. EXPLAIN on a 50k-row rollback fixture used
-- the longer index-only scans with identical cost before/after dropping these prefixes.
DROP INDEX "L_visibility_trendingScore_idx";
DROP INDEX "L_visibility_helpfulCount_idx";

-- PostgreSQL updates indexed column references on column rename, but not index names.
ALTER INDEX "L_visibility_trendingScore_id_idx"
  RENAME TO "L_visibility_popularityScore_id_idx";
ALTER INDEX "L_category_visibility_trendingScore_id_idx"
  RENAME TO "L_category_visibility_popularityScore_id_idx";

-- C8: substring user search needs trigram indexing; a B-tree cannot serve leading-wildcard
-- ILIKE. EXPLAIN ANALYZE on 50k rows changed the combined expression lookup from a 16ms
-- sequential scan to a 0.022ms bitmap index/heap scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "User_search_trgm_idx" ON "User" USING GIN (
  ("username" || ' ' || COALESCE("name", '')) gin_trgm_ops
);

-- C6: gapped-rank neighbor lookups need collection/rank order. EXPLAIN ANALYZE on a
-- 50k-row rollback fixture changed the append-neighbor lookup from Seq Scan + Sort
-- (5.485ms, cost 1468) to an Index Only Scan (0.016ms, startup cost 0.49).
CREATE INDEX "CollectionL_collectionId_position_lId_idx"
  ON "CollectionL"("collectionId", "position", "lId");
