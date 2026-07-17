CREATE TABLE "OAuthHandoff" (
    "id" TEXT NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "sub" TEXT NOT NULL,
    "returnTo" VARCHAR(512) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthHandoff_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OAuthHandoff_expiry_order" CHECK ("expiresAt" > "createdAt"),
    CONSTRAINT "OAuthHandoff_consumption_order" CHECK (
        "consumedAt" IS NULL OR (
            "consumedAt" >= "createdAt" AND "consumedAt" < "expiresAt"
        )
    )
);

CREATE UNIQUE INDEX "OAuthHandoff_codeHash_key" ON "OAuthHandoff"("codeHash");
CREATE INDEX "OAuthHandoff_sub_idx" ON "OAuthHandoff"("sub");
CREATE INDEX "OAuthHandoff_expiresAt_id_idx" ON "OAuthHandoff"("expiresAt", "id");
CREATE INDEX "OAuthHandoff_consumedAt_id_idx" ON "OAuthHandoff"("consumedAt", "id");

ALTER TABLE "OAuthHandoff"
ADD CONSTRAINT "OAuthHandoff_sub_fkey"
FOREIGN KEY ("sub") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
