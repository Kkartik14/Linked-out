DROP INDEX IF EXISTS "Reaction_sidebar_helpful_createdAt_lId_userId_idx";
DROP INDEX IF EXISTS "Reaction_sidebar_active_createdAt_lId_userId_idx";

CREATE INDEX "Reaction_sidebar_active_createdAt_lId_userId_idx"
ON "Reaction"("createdAt", "lId", "userId") INCLUDE ("type")
WHERE "type" <> 'SAVED';
