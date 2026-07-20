CREATE INDEX CONCURRENTLY "Notification_recipientId_createdAt_id_idx"
ON "Notification"("recipientId", "createdAt" DESC, "id" DESC);
