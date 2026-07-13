import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const crossFeatureRepositoryImport = {
  regex: "^\\.\\./[^/]+/.*\\.repository$",
  message: "Collaborate through the feature's application service, not its repository.",
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
    files: ["apps/api/src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [crossFeatureRepositoryImport] },
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
);
