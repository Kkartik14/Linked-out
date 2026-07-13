-- C9: profile reads use persisted graph-degree counters instead of running two
-- relation COUNTs on every request. Defaults preserve new-user behavior; these
-- aggregate backfills preserve every existing Follow edge.
BEGIN;

-- Hold graph writes across backfill + trigger installation. Without this lock,
-- an edge committed between the aggregate snapshot and trigger creation could
-- be permanently absent from the persisted counters.
LOCK TABLE "Follow" IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE "User"
  ADD COLUMN "followerCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "followingCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "User" AS target
SET "followerCount" = source."count"
FROM (
  SELECT "followingId" AS "userId", COUNT(*)::INTEGER AS "count"
  FROM "Follow"
  GROUP BY "followingId"
) AS source
WHERE target."id" = source."userId";

UPDATE "User" AS target
SET "followingCount" = source."count"
FROM (
  SELECT "followerId" AS "userId", COUNT(*)::INTEGER AS "count"
  FROM "Follow"
  GROUP BY "followerId"
) AS source
WHERE target."id" = source."userId";

ALTER TABLE "User"
  ADD CONSTRAINT "User_followerCount_nonnegative" CHECK ("followerCount" >= 0),
  ADD CONSTRAINT "User_followingCount_nonnegative" CHECK ("followingCount" >= 0);

-- Put maintenance next to the invariant. A Follow can be written by the API,
-- seed/reconciliation tooling, or a future worker; every path must update both
-- endpoint users atomically. Acquire transaction locks before FK checks and in
-- stable id order: otherwise two mutual inserts can each hold a KEY SHARE lock
-- and deadlock while trying to upgrade the same endpoint rows.
CREATE FUNCTION "linkedout_lock_follow_endpoints"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  follower_id TEXT;
  following_id TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    follower_id := NEW."followerId";
    following_id := NEW."followingId";
  ELSE
    follower_id := OLD."followerId";
    following_id := OLD."followingId";
  END IF;

  IF follower_id <= following_id THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('linkedout:follow:' || follower_id, 0));
    IF follower_id <> following_id THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('linkedout:follow:' || following_id, 0));
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('linkedout:follow:' || following_id, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('linkedout:follow:' || follower_id, 0));
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE FUNCTION "linkedout_maintain_follow_counters"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  follower_id TEXT;
  following_id TEXT;
  counter_delta INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    follower_id := NEW."followerId";
    following_id := NEW."followingId";
    counter_delta := 1;
  ELSE
    follower_id := OLD."followerId";
    following_id := OLD."followingId";
    counter_delta := -1;
  END IF;

  PERFORM 1
  FROM "User"
  WHERE "id" IN (follower_id, following_id)
  ORDER BY "id"
  FOR UPDATE;

  UPDATE "User"
  SET "followingCount" = "followingCount" + counter_delta
  WHERE "id" = follower_id;

  UPDATE "User"
  SET "followerCount" = "followerCount" + counter_delta
  WHERE "id" = following_id;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "Follow_lock_counter_endpoints"
BEFORE INSERT OR DELETE ON "Follow"
FOR EACH ROW
EXECUTE FUNCTION "linkedout_lock_follow_endpoints"();

CREATE TRIGGER "Follow_maintain_counters"
AFTER INSERT OR DELETE ON "Follow"
FOR EACH ROW
EXECUTE FUNCTION "linkedout_maintain_follow_counters"();

COMMIT;
