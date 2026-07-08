-- Remove the lessonLearned field. The generated searchVector column depends on it, so
-- drop+recreate the vector (now: title weight A, story weight B) and its GIN index.
DROP INDEX IF EXISTS "L_search_idx";
ALTER TABLE "L" DROP COLUMN "searchVector";
ALTER TABLE "L" DROP COLUMN "lessonLearned";

ALTER TABLE "L" ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("story", '')), 'B')
    ) STORED;

CREATE INDEX "L_search_idx" ON "L" USING GIN ("searchVector");
