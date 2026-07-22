CREATE TYPE "EmailOtpPurpose" AS ENUM ('SIGNUP', 'PASSWORD_RESET');

CREATE TABLE "PasswordCredential" (
  "userId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "EmailOtpChallenge" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "purpose" "EmailOtpPurpose" NOT NULL,
  "codeDigest" CHAR(64) NOT NULL,
  "passwordHash" TEXT,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "deliveryCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),

  CONSTRAINT "EmailOtpChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailOtpChallenge_expiry_order" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "EmailOtpChallenge_attempts_nonnegative" CHECK ("failedAttempts" >= 0),
  CONSTRAINT "EmailOtpChallenge_delivery_count_positive" CHECK ("deliveryCount" > 0),
  CONSTRAINT "EmailOtpChallenge_signup_password" CHECK (
    ("purpose" = 'SIGNUP' AND "passwordHash" IS NOT NULL)
    OR ("purpose" = 'PASSWORD_RESET' AND "passwordHash" IS NULL)
  ),
  CONSTRAINT "EmailOtpChallenge_consumption_order" CHECK (
    "consumedAt" IS NULL OR "consumedAt" >= "createdAt"
  )
);

CREATE TABLE "EmailOtpOutbox" (
  "challengeId" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailOtpOutbox_pkey" PRIMARY KEY ("challengeId")
);

CREATE UNIQUE INDEX "EmailOtpChallenge_email_purpose_key"
  ON "EmailOtpChallenge"("email", "purpose");
CREATE INDEX "EmailOtpChallenge_expiresAt_id_idx"
  ON "EmailOtpChallenge"("expiresAt", "id");
CREATE INDEX "EmailOtpChallenge_consumedAt_id_idx"
  ON "EmailOtpChallenge"("consumedAt", "id");

ALTER TABLE "PasswordCredential"
  ADD CONSTRAINT "PasswordCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailOtpOutbox"
  ADD CONSTRAINT "EmailOtpOutbox_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "EmailOtpChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
