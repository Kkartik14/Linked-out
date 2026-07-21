// @vitest-environment node

import { describe, expect, it } from "vitest";

import { relatedApiOrigin } from "./related-api-origin";

const apiProject = {
  project: { id: "prj_api", name: "linked-out-api" },
  production: { alias: "linked-out-api.vercel.app" },
  preview: { branch: "linked-out-api-git-feature-team.vercel.app" },
};

describe("relatedApiOrigin", () => {
  it("selects the matching API branch during a preview", () => {
    expect(
      relatedApiOrigin("https://api-fallback.example", "preview", [apiProject]),
    ).toBe("https://linked-out-api-git-feature-team.vercel.app");
  });

  it("prefers a custom preview environment alias", () => {
    expect(
      relatedApiOrigin("https://api-fallback.example", "preview", [
        {
          ...apiProject,
          preview: {
            ...apiProject.preview,
            customEnvironment: "api-staging.example.com",
          },
        },
      ]),
    ).toBe("https://api-staging.example.com");
  });

  it("keeps explicit local and production configuration", () => {
    expect(relatedApiOrigin("http://localhost:4000", undefined, [apiProject])).toBe(
      "http://localhost:4000",
    );
    expect(
      relatedApiOrigin("https://api.production.example", "production", [apiProject]),
    ).toBe("https://api.production.example");
  });

  it("falls back when Vercel omits related-project data", () => {
    expect(relatedApiOrigin("https://api-fallback.example", "preview", [])).toBe(
      "https://api-fallback.example",
    );
  });
});
