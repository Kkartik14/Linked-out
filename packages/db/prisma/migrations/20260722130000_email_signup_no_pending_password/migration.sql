-- Family-A email signup (feature 1.1.3): the account password is authored at POST /auth/email/verify
-- by the holder of the emailed code, never at signup. The signup challenge therefore no longer holds
-- a pending password, which closes the account pre-hijacking window (a pre-verification password
-- could otherwise be seeded or overwritten by a third party). Drop the column and the CHECK that
-- tied SIGNUP challenges to a non-null password.
ALTER TABLE "EmailOtpChallenge" DROP CONSTRAINT "EmailOtpChallenge_signup_password";
ALTER TABLE "EmailOtpChallenge" DROP COLUMN "passwordHash";
