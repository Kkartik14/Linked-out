-- Add the remaining denormalized per-type reaction counters.
ALTER TABLE "L" ADD COLUMN "respectCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "L" ADD COLUMN "painCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "L" ADD COLUMN "savedCount" INTEGER NOT NULL DEFAULT 0;
