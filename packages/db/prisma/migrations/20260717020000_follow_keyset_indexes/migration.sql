-- Follower and following lists paginate by keyset:
--   SELECT ... WHERE "followingId" = $1 AND id < $2 ORDER BY id DESC LIMIT $3
--
-- The single-column indexes could locate a user's rows but carried no `id`, so they could not
-- serve the ORDER BY. Postgres instead scanned the primary key backwards and filtered — on an
-- account with 300k followers, measured at 6,701 buffers / 21ms discarding 300,000 rows to
-- return one 21-row page. Cost grows with the whole table, not the page.
--
-- With `id` trailing the equality column, the same page is an index-only scan: 4 buffers /
-- 0.04ms, nothing discarded.
--
-- `Follow_followerId_idx` was additionally redundant: the `(followerId, followingId)` unique
-- index already serves any `followerId` prefix lookup.

DROP INDEX IF EXISTS "Follow_followingId_idx";
DROP INDEX IF EXISTS "Follow_followerId_idx";

CREATE INDEX "Follow_followingId_id_idx" ON "Follow"("followingId", "id" DESC);
CREATE INDEX "Follow_followerId_id_idx" ON "Follow"("followerId", "id" DESC);
