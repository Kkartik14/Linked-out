-- Pre-launch contract consolidation: remove fields that existed only on the retired
-- prototype API. Rebuild the generated search vector because PostgreSQL will not allow
-- referenced columns to be dropped while the generated expression exists.
DROP INDEX IF EXISTS "L_search_idx";
ALTER TABLE "L" DROP COLUMN "searchVector";

ALTER TABLE "L"
  DROP COLUMN "category",
  DROP COLUMN "company",
  DROP COLUMN "tags",
  DROP COLUMN "eventDate";

DROP TYPE "LCategory";

ALTER TABLE "L" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("story", '')), 'B')
  ) STORED;

CREATE INDEX "L_search_idx" ON "L" USING GIN ("searchVector");
