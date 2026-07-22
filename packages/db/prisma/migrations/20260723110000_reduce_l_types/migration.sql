-- Reclassify retired types before replacing the PostgreSQL enum.
UPDATE "L" SET "type" = 'L' WHERE "type"::text IN ('CHECKPOINT', 'LESSON');

ALTER TABLE "L" ALTER COLUMN "type" DROP DEFAULT;
ALTER TYPE "LType" RENAME TO "LType_old";
CREATE TYPE "LType" AS ENUM ('L', 'WIN', 'STORY', 'SCAR', 'PLOT_TWIST', 'BATTLE');
ALTER TABLE "L" ALTER COLUMN "type" TYPE "LType" USING ("type"::text::"LType");
ALTER TABLE "L" ALTER COLUMN "type" SET DEFAULT 'L';
DROP TYPE "LType_old";

ALTER TABLE "User" DROP COLUMN "lessonsShared";
