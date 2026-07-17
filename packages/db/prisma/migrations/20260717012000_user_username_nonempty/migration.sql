ALTER TABLE "User"
ADD CONSTRAINT "User_username_nonempty"
CHECK ("username" IS NULL OR NULLIF(BTRIM("username"), '') IS NOT NULL);
