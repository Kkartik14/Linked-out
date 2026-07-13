-- C22: bounded retention deletes select expired rows in expiry/key order. On a
-- 50k-row PostgreSQL rollback fixture, Session cleanup changed from Seq Scan + Sort
-- (19.823ms, cost 2607.84) to an ordered index scan (0.200ms, startup cost 0.42).
CREATE INDEX "Session_expires_id_idx" ON "Session"("expires", "id");

-- The same fixture changed VerificationToken cleanup from Seq Scan + Sort
-- (21.464ms, cost 2506.59) to an ordered index scan (0.550ms, startup cost 0.42).
CREATE INDEX "VerificationToken_expires_token_idx"
  ON "VerificationToken"("expires", "token");
