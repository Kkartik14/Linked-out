export const BROWSER_SESSION_COOKIE = "lo_sid";

/** One policy for setting and clearing the host-only browser-session credential. */
export function browserSessionCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(expires ? { expires } : {}),
  };
}
