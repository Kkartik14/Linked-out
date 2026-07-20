-- PostgreSQL concurrent index operations cannot run inside an explicit transaction. Keeping one
-- build per migration makes a failed deploy independently recoverable through Prisma migrate.
CREATE INDEX CONCURRENTLY "L_authorId_id_idx" ON "L"("authorId", "id" DESC);
