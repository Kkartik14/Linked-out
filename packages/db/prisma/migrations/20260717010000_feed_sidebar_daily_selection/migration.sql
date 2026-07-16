CREATE TABLE "DailyLSelection" (
    "selectedFor" DATE NOT NULL,
    "lId" TEXT,
    "interactionCount" INTEGER NOT NULL DEFAULT 0,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyLSelection_pkey" PRIMARY KEY ("selectedFor")
);

CREATE INDEX "DailyLSelection_lId_idx" ON "DailyLSelection"("lId");

ALTER TABLE "DailyLSelection"
ADD CONSTRAINT "DailyLSelection_lId_fkey"
FOREIGN KEY ("lId") REFERENCES "L"("id") ON DELETE SET NULL ON UPDATE CASCADE;
