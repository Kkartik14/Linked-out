import { describe, expect, it } from "vitest";

import { csrfRejection, hasDisallowedContentType, requestOrigin } from "./csrf";

const ORIGIN = "https://linkedout.app";

function req(
  method: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${ORIGIN}/v1/ls`, { method, headers });
}

describe("csrfRejection", () => {
  it("passes safe methods regardless of origin", () => {
    expect(csrfRejection(req("GET", { origin: "https://evil.test" }), ORIGIN)).toBeNull();
    expect(csrfRejection(req("HEAD"), ORIGIN)).toBeNull();
  });

  it("passes an unsafe request from the approved origin with JSON", () => {
    const r = req("POST", { origin: ORIGIN, "content-type": "application/json" });
    expect(csrfRejection(r, ORIGIN)).toBeNull();
  });

  it("rejects an unsafe request from a hostile sibling origin (AUTH-07)", () => {
    const r = req("POST", { origin: "https://cdn.linkedout.app", "content-type": "application/json" });
    expect(csrfRejection(r, ORIGIN)).toBe("origin");
  });

  it("rejects an unsafe request with no Origin and no Referer", () => {
    expect(csrfRejection(req("DELETE"), ORIGIN)).toBe("origin");
  });

  it("accepts Referer as an Origin fallback", () => {
    const r = req("POST", { referer: `${ORIGIN}/ls/abc`, "content-type": "application/json" });
    expect(csrfRejection(r, ORIGIN)).toBeNull();
  });

  it("rejects a form-submittable content type from the approved origin", () => {
    const r = req("POST", { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" });
    expect(csrfRejection(r, ORIGIN)).toBe("content-type");
  });

  it("allows a bodyless unsafe request (no content type) from the approved origin", () => {
    // A reaction PUT or a DELETE sends no body/content-type; the origin check is its guard.
    expect(csrfRejection(req("DELETE", { origin: ORIGIN }), ORIGIN)).toBeNull();
    expect(csrfRejection(req("PUT", { origin: ORIGIN }), ORIGIN)).toBeNull();
  });
});

describe("hasDisallowedContentType", () => {
  it("ignores parameters on the media type", () => {
    const r = req("POST", { "content-type": "application/json; charset=utf-8" });
    expect(hasDisallowedContentType(r)).toBe(false);
  });

  it("is false when absent", () => {
    expect(hasDisallowedContentType(req("DELETE"))).toBe(false);
  });
});

describe("requestOrigin", () => {
  it("prefers Origin over Referer", () => {
    const r = req("POST", { origin: ORIGIN, referer: "https://evil.test/x" });
    expect(requestOrigin(r)).toBe(ORIGIN);
  });

  it("is null when a Referer is unparseable and Origin is absent", () => {
    expect(requestOrigin(req("POST", { referer: "not a url" }))).toBeNull();
  });
});
