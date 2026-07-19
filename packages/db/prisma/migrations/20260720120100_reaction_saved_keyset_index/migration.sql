CREATE INDEX CONCURRENTLY "Reaction_userId_type_id_idx"
ON "Reaction"("userId", "type", "id" DESC);
