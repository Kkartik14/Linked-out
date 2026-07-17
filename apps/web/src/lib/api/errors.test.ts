import { describe, expect, it } from "vitest";

import { ApiError, errorMessage, fieldErrors, isApiError } from "./errors";

describe("API error helpers", () => {
  it("identifies ApiError instances", () => {
    const error = new ApiError(403, "FORBIDDEN", "No access");

    expect(isApiError(error)).toBe(true);
    expect(isApiError(new Error("No access"))).toBe(false);
  });

  it("flattens first validation message per field", () => {
    const error = new ApiError(400, "VALIDATION_ERROR", "Invalid", [
      { field: "title", code: "required", message: "Title is required." },
      { field: "title", code: "too_long", message: "Title is too long." },
      { field: "story", code: "too_long", message: "Story is too long." },
    ]);

    expect(fieldErrors(error)).toEqual({
      title: "Title is required.",
      story: "Story is too long.",
    });
  });

  it("returns safe fallback messages for unknown thrown values", () => {
    expect(errorMessage(new ApiError(404, "L_NOT_FOUND", "Missing"))).toBe("Missing");
    expect(errorMessage(new Error("Network failed"))).toBe("Network failed");
    expect(errorMessage("bad", "Fallback")).toBe("Fallback");
  });
});
