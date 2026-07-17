-- The one-origin BFF stores only a SHA-256 lookup identity for the random browser cookie.
-- The primary key is the stable `sid` carried by short-lived internal API assertions.
CREATE TABLE "BrowserSession" (
  "sid" TEXT NOT NULL,
  "cookieHash" CHAR(64) NOT NULL,
  "sub" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "BrowserSession_pkey" PRIMARY KEY ("sid"),
  CONSTRAINT "BrowserSession_lastUsedAt_not_before_createdAt_check"
    CHECK ("lastUsedAt" >= "createdAt"),
  CONSTRAINT "BrowserSession_revokedAt_not_before_createdAt_check"
    CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);

CREATE UNIQUE INDEX "BrowserSession_cookieHash_key" ON "BrowserSession"("cookieHash");
CREATE INDEX "BrowserSession_sub_idx" ON "BrowserSession"("sub");
CREATE INDEX "BrowserSession_createdAt_sid_idx" ON "BrowserSession"("createdAt", "sid");
CREATE INDEX "BrowserSession_lastUsedAt_sid_idx" ON "BrowserSession"("lastUsedAt", "sid");
CREATE INDEX "BrowserSession_revokedAt_sid_idx" ON "BrowserSession"("revokedAt", "sid");

ALTER TABLE "BrowserSession"
  ADD CONSTRAINT "BrowserSession_sub_fkey"
  FOREIGN KEY ("sub") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
