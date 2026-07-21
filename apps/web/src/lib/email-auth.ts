import { errorMessage, isApiError } from "@/lib/api";

/**
 * Finish an email sign-in by handing its one-time code to the browser-visible OAuth handoff route.
 *
 * `verify` and `login` return the *same* `{ code, expiresAt, returnTo }` envelope OAuth does
 * (backend feature 1.1.3 "reuses the existing OAuth handoff/session authority; there is no second
 * session type"). So the frontend has nothing new to build here: it navigates to the existing
 * `/auth/callback/handoff` route, which exchanges the single-use code for the opaque `lo_sid`
 * session cookie, sets it HttpOnly, and redirects on to the server-bound `returnTo`. The code is
 * short-lived and single-use, exactly as it is when Nest redirects the browser here after OAuth.
 *
 * A full-document navigation is deliberate — the handoff is a server route handler, not a page, so
 * `router.push` cannot run it. It is factored out as its own function so form components can be
 * unit-tested by mocking this module rather than the global `location`.
 */
export function completeEmailSession(code: string): void {
  window.location.assign(`/auth/callback/handoff?code=${encodeURIComponent(code)}`);
}

/**
 * Present an email-auth failure. The backend owns the business copy, so the default is its own
 * message; a few codes get frontend-context copy the server cannot compose (e.g. pointing a user
 * at the OAuth alternatives when email delivery is switched off). Every branch stays account
 * enumeration-safe — the API already answers signup/forgot/login generically, and this never adds
 * a distinction the wire withheld.
 */
export function emailAuthErrorMessage(err: unknown): string {
  if (!isApiError(err)) return errorMessage(err);

  switch (err.code) {
    case "INVALID_OTP":
      return "That code is incorrect or has expired. Request a new one and try again.";
    case "INVALID_CREDENTIALS":
      // Same answer for "no such account" and "wrong password" — deliberately not distinguished.
      return "The email or password is incorrect.";
    case "RATE_LIMITED":
      return "Too many attempts. Please wait a moment and try again.";
    case "PROVIDER_NOT_CONFIGURED":
      return "Email sign-in isn’t available right now. Try continuing with Google or GitHub.";
    case "VALIDATION_ERROR":
      return "Please check the details you entered and try again.";
    default:
      return errorMessage(err);
  }
}
