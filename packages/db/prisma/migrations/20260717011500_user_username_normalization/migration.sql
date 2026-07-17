UPDATE "User"
SET "username" = NULL
WHERE "username" IS NOT NULL
  AND NULLIF(BTRIM("username"), '') IS NULL;
