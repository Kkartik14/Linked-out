import { describe, expect, it } from "vitest";

import { compactNumber, initials, timeAgo, truncate } from "@/lib/format";

describe("initials", () => {
  it("uses first + last for a full name", () => {
    expect(initials("Kartik Gupta")).toBe("KG");
  });
  it("uses two letters for a single token", () => {
    expect(initials("Cher")).toBe("CH");
  });
  it("falls back to the username", () => {
    expect(initials(null, "anaya")).toBe("AN");
  });
  it("falls back to ? when nothing is known", () => {
    expect(initials(null)).toBe("?");
  });
});

describe("truncate", () => {
  it("leaves short strings untouched", () => {
    expect(truncate("short", 10)).toBe("short");
  });
  it("cuts on a word boundary with an ellipsis", () => {
    const result = truncate("the quick brown fox jumps", 12);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(13);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-07-07T12:00:00.000Z");
  it("handles seconds", () => {
    expect(timeAgo("2026-07-07T11:59:30.000Z", now)).toMatch(/second|now/);
  });
  it("handles days", () => {
    expect(timeAgo("2026-07-04T12:00:00.000Z", now)).toContain("3 days ago");
  });
});

describe("compactNumber", () => {
  it("compacts thousands", () => {
    expect(compactNumber(1200)).toBe("1.2K");
  });
  it("leaves small numbers alone", () => {
    expect(compactNumber(5)).toBe("5");
  });
});
