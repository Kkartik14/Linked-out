import next from "eslint-config-next";
import tseslint from "typescript-eslint";

/**
 * `eslint-config-next` brings the React/Next/a11y rules but no type-safety policy, so
 * CLAUDE.md §1 ("No `any`. No `unknown` as an escape hatch") was documented and unenforced —
 * `tsc --strict` only rejects *implicit* any. These rules are the enforcement.
 *
 * Run with `--max-warnings=0` (see package.json): several of the rules that matter most
 * here — `react-hooks/exhaustive-deps` above all — ship at warn level, and a warning that
 * cannot fail CI is a warning nobody reads.
 */
const eslintConfig = [
  ...next,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    // `projectService` gives the type-aware rules below a program. tsconfig.json already
    // includes every .ts/.tsx here, config files at the root included.
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // A cast is allowed only at a validated boundary; `as unknown as T` is never one.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      // `_`-prefixed names stay legal so an exhaustiveness `never` binding can be declared.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Vendored shadcn/ui primitives: `shadcn add` regenerates these verbatim, so a local
    // deviation is lost on the next update. Both patterns it emits are defensible —
    // `createContext({} as T)` (no sensible default) and `as React.CSSProperties` (CSS
    // custom properties genuinely aren't expressible in that type).
    files: ["src/components/ui/**"],
    rules: { "@typescript-eslint/consistent-type-assertions": "off" },
  },
  {
    // CommonJS by extension: the e2e harness is loaded by Playwright's Node runtime.
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    ignores: [".next/**", "node_modules/**"],
  },
];

export default eslintConfig;
