"use client";

import * as React from "react";

/**
 * A countdown that gates the "resend code" control.
 *
 * The backend keeps the same OTP alive for its whole 10-minute window and rate-limits issuance, so
 * a resend button that a user can hammer is pure frustration — it cannot produce a new code and
 * will start earning `429`s. This throttles the control client-side to a short, visible cooldown so
 * the common case never reaches the limiter. It is advisory UX, not the security boundary.
 */
export function useResendCooldown(seconds = 30) {
  const [remaining, setRemaining] = React.useState(0);

  React.useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const start = React.useCallback(() => setRemaining(seconds), [seconds]);

  return { remaining, active: remaining > 0, start };
}
