import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  { ignores: ["dist", "convex/_generated", "node_modules", "agent", "test-results", "playwright-report"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // The new React Compiler rules flag patterns this codebase uses on purpose (ref-mirrored handlers).
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      // Summary elements and labelled native controls are handled by the browser.
      "jsx-a11y/no-autofocus": "off",
      // Labels wrap their control with text in nested spans.
      "jsx-a11y/label-has-associated-control": ["error", { assert: "either", depth: 4 }],
      // Freshness labels read the clock during render on purpose.
      "react-hooks/purity": "off",
    },
  },
  {
    files: ["tests/**/*.{mjs,ts}", "scripts/**/*.mjs", "public/**/*.js"],
    languageOptions: { globals: { process: "readonly", console: "readonly", fetch: "readonly", setTimeout: "readonly", window: "readonly", document: "readonly", localStorage: "readonly" } },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
