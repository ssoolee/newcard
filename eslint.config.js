import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "functions/lib", "**/node_modules/**", "public/sw.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      /**
       * This is a privacy control, not a style preference.
       *
       * Card data belongs to third parties and must never reach Cloud Logging,
       * which retains what it receives for weeks. One `console.error(result)`
       * in an error path would put names, phone numbers and email addresses
       * there. `functions/src/log.ts` is the only permitted logging path, and
       * it accepts a fixed whitelist of non-personal fields.
       *
       * Making the unsafe call a build error means the hole cannot be reopened
       * by accident. Do not downgrade this to a warning.
       */
      "no-console": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["functions/src/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["eslint.config.js", "vite.config.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
);
