import { describe, expect, it } from "vitest";

import { compactNumber, initials, timeAgo, truncate } from "@/lib/format";

describe("initials", () => {
  it("uses first + last for a full name", () => {
    expect(initials("Kartik Gupta")).toBe("KG");
  });
  it("uses first + LAST for a three-token name, not the first two", () => {
    expect(initials("Ada Byron Lovelace")).toBe("AL");
  });
  it("uses two letters for a single token", () => {
    expect(initials("Cher")).toBe("CH");
  });
  it("uses the one letter it has for a single-character token", () => {
    expect(initials("x")).toBe("X");
  });
  it("falls back to the username", () => {
    expect(initials(null, "anaya")).toBe("AN");
  });
  it("falls back to ? when nothing is known", () => {
    expect(initials(null)).toBe("?");
    expect(initials("   ")).toBe("?");
    expect(initials(null, "")).toBe("?");
  });
});

describe("truncate", () => {
  it("leaves short strings untouched", () => {
    expect(truncate("short", 10)).toBe("short");
  });
  it("leaves a string of exactly max untouched", () => {
    // Boundary: `<=`, not `<`. At `<` this returns "abcde…".
    expect(truncate("abcde", 5)).toBe("abcde");
  });
  it("cuts on a word boundary with an ellipsis", () => {
    // Exact output, not just "ends with an ellipsis": drop the word-boundary cut and this
    // returns "the quick br…", which the old shape-only assertion happily accepted.
    expect(truncate("the quick brown fox jumps", 12)).toBe("the quick…");
    expect(truncate("the quick brown", 9)).toBe("the…");
  });
  it("cuts mid-word only when there is no earlier boundary", () => {
    expect(truncate("abcdef", 5)).toBe("abcde…");
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
