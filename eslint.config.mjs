import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const crossFeatureRepositoryImport = {
  regex: "^\\.\\./[^/]+/.*\\.repository$",
  message: "Collaborate through the feature's application service, not its repository.",
};

/**
 * claude.md §2: "Repository (DAL) — all Prisma access." This was previously enforced only on
 * `*.service.ts`, so a controller or mapper reaching straight for Prisma linted clean and the
 * layering rule held by habit alone. Banned everywhere under `apps/api/src`, then re-allowed
 * below for the files whose whole job is Prisma access.
 */
const prismaOutsideRepository = {
  name: "@linkedout/db",
  message: "All Prisma access lives in a repository (claude.md §2).",
};

/** Node's CommonJS globals — the test suites and scripts are `.cjs`, not bundled modules. */
const commonjsGlobals = {
  __dirname: "readonly",
  __filename: "readonly",
  atob: "readonly",
  btoa: "readonly",
  Buffer: "readonly",
  console: "readonly",
  exports: "writable",
  fetch: "readonly",
  module: "writable",
  process: "readonly",
  require: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  URL: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
  AbortController: "readonly",
  structuredClone: "readonly",
};

/**
 * Backend-workspace lint policy. The web app remains a separate workspace with Next's
 * framework-specific config; this config covers API and shared-package TypeScript.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/generated/**",
      "**/node_modules/**",
      "packages/db/prisma/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/api/src/**/*.ts", "packages/contracts/src/**/*.ts", "packages/db/src/**/*.ts"],
    rules: {
      // Security validators intentionally match ASCII control ranges (for URLs/headers).
      "no-control-regex": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["apps/api/src/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: [prismaOutsideRepository] }],
    },
  },
  {
    files: ["apps/api/src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [prismaOutsideRepository], patterns: [crossFeatureRepositoryImport] },
      ],
    },
  },
  {
    files: ["apps/api/src/modules/**/*.repository.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            crossFeatureRepositoryImport,
            {
              group: ["**/*.policy"],
              message: "Repositories execute domain plans; they do not import business policy.",
            },
            {
              group: ["**/errors/app-exception"],
              message: "Repositories return domain state; they do not translate HTTP errors.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportSpecifier[imported.name='decodeCursor']",
          message: "Decode and validate cursors in the application service.",
        },
        {
          selector: "ImportSpecifier[imported.name='decodeCursorId']",
          message: "Decode and validate cursors in the application service.",
        },
      ],
    },
  },
  {
    files: ["apps/api/src/modules/**/*.service.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@linkedout/db",
              message: "Application services use domain plans and repository interfaces, not Prisma.",
            },
          ],
          patterns: [crossFeatureRepositoryImport],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/modules/**/*.module.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name='exports'] > ArrayExpression > Identifier[name=/Repository$/]",
          message: "Feature modules export application services, never repositories.",
        },
      ],
    },
  },
  {
    // The Prisma seam itself, the maintenance persistence adapter, and the shared read-model
    // types are *defined* in terms of Prisma — the ban above is the rule they implement.
    files: [
      "apps/api/src/prisma/**/*.ts",
      "apps/api/src/maintenance/**/*.ts",
      "apps/api/src/common/read-models/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // Previously unlinted entirely — including `scripts/db-safety-guard.cjs`, the fail-closed
    // guard in front of every destructive database operation.
    files: ["scripts/**/*.cjs", "apps/api/test/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: commonjsGlobals,
    },
    rules: {
      // These are genuine CommonJS files, not TypeScript emitting to CJS.
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
