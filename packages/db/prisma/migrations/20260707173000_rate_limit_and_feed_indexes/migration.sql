CREATE INDEX "L_visibility_id_idx" ON "L"("visibility", "id" DESC);
CREATE INDEX "L_visibility_trendingScore_id_idx" ON "L"("visibility", "trendingScore" DESC, "id" DESC);
CREATE INDEX "L_visibility_helpfulCount_id_idx" ON "L"("visibility", "helpfulCount" DESC, "id" DESC);
CREATE INDEX "L_category_visibility_id_idx" ON "L"("category", "visibility", "id" DESC);
CREATE INDEX "L_category_visibility_trendingScore_id_idx" ON "L"("category", "visibility", "trendingScore" DESC, "id" DESC);
CREATE INDEX "L_category_visibility_helpfulCount_id_idx" ON "L"("category", "visibility", "helpfulCount" DESC, "id" DESC);

CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
