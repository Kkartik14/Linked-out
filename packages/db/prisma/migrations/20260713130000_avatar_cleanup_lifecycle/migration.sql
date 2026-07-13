-- C22: bind profile references to stable object identity and make asset deletion a
-- durable two-phase lifecycle instead of an unsafe DB-check -> R2-delete window.
ALTER TABLE "User" ADD COLUMN "avatarObjectKey" TEXT;

-- Backfill only generated, user-owned avatar paths. The host and any base pathname are
-- deliberately not constrained: both `https://old.example/avatars/<id>/x.jpg` and
-- `https://old.example/media/public/avatars/<id>/x.jpg` preserve the same object key.
-- The final ownership predicate prevents a different user's path from being claimed.
WITH parsed AS (
  SELECT
    "id",
    substring(
      "image" FROM '^https?://[^/?#]+/[^?#]*(avatars/[^?#]+)([?#].*)?$'
    ) AS object_key
  FROM "User"
  WHERE "image" IS NOT NULL
)
UPDATE "User" AS target
SET "avatarObjectKey" = parsed.object_key
FROM parsed
WHERE target."id" = parsed."id"
  AND parsed.object_key LIKE ('avatars/' || target."id" || '/%')
  AND parsed.object_key ~ ('^avatars/' || target."id" || '/[A-Za-z0-9][A-Za-z0-9._-]*$');

CREATE UNIQUE INDEX "User_avatarObjectKey_key" ON "User"("avatarObjectKey");

CREATE TABLE "AvatarDeletionClaim" (
  "key" TEXT NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AvatarDeletionClaim_pkey" PRIMARY KEY ("key")
);
