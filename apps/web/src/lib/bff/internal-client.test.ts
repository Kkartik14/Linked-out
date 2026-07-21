// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadClient(bypassSecret?: string) {
  vi.stubEnv("BFF_CALLER_SECRET", "bff-caller-secret-at-least-32-bytes");
  vi.stubEnv("INTERNAL_API_BASE_URL", "http://localhost:4000");
  if (bypassSecret) vi.stubEnv("INTERNAL_API_BYPASS_SECRET", bypassSecret);
  return import("./internal-client");
}

describe("internal API preview protection", () => {
  it("replaces a browser-supplied bypass value with the server-only configured secret", async () => {
    const client = await loadClient("server-owned-bypass");
    const headers = new Headers({
      "x-vercel-protection-bypass": "browser-controlled",
    });

    client.applyInternalApiProtection(headers);

    expect(headers.get("x-vercel-protection-bypass")).toBe("server-owned-bypass");
  });

  it("strips a browser-supplied bypass value when API previews are public", async () => {
    const client = await loadClient();
    const headers = new Headers({
      "x-vercel-protection-bypass": "browser-controlled",
    });

    client.applyInternalApiProtection(headers);

    expect(headers.get("x-vercel-protection-bypass")).toBeNull();
  });
});
