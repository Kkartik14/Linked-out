import { describe, expect, it, vi } from "vitest";

import { logCsrfRejection } from "./security-rejection";

describe("logCsrfRejection", () => {
  it("records only the stable method, path, code, and reason", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const request = new Request("https://linkedout.example/v1/ls?code=oauth-secret", {
      method: "POST",
      headers: { cookie: "lo_sid=session-secret" },
    });

    logCsrfRejection(request, "origin");

    expect(warn).toHaveBeenCalledWith("security_rejection", {
      code: "CSRF_REJECTED",
      method: "POST",
      path: "/v1/ls",
      reason: "origin",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("oauth-secret");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("session-secret");
    warn.mockRestore();
  });
});
