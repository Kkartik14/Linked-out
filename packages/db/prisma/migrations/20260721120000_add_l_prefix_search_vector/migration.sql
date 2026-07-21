-- PostgreSQL's English dictionary stems source words (for example, "running" becomes
-- "run") and removes stopwords. That is desirable for completed search terms but makes
-- it unsuitable for character-by-character prefix lookup. Preserve the source lexemes in
-- a second weighted vector so an unfinished final token can use an indexed `:*` query.
ALTER TABLE "L" ADD COLUMN "searchPrefixVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("story", '')), 'B')
  ) STORED;

CREATE INDEX "L_search_prefix_idx" ON "L" USING GIN ("searchPrefixVector");
