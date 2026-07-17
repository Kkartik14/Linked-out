CREATE INDEX "Reaction_sidebar_active_createdAt_lId_userId_idx"
ON "Reaction"("createdAt", "lId", "userId")
WHERE "type" <> 'SAVED';

CREATE INDEX "Reaction_sidebar_helpful_createdAt_lId_userId_idx"
ON "Reaction"("createdAt", "lId", "userId")
WHERE "type" = 'HELPFUL';
