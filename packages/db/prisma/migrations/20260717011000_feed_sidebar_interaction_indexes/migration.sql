CREATE INDEX "Reaction_createdAt_lId_userId_idx"
ON "Reaction"("createdAt", "lId", "userId");

CREATE INDEX "Comment_createdAt_lId_authorId_idx"
ON "Comment"("createdAt", "lId", "authorId");
