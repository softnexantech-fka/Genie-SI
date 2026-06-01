import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginReactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Ignore generated/build artifacts and non-source snapshots/backups
  globalIgnores([
    "**/dist/**",
    "**/node_modules/**",
    "**/test-results/**",
    "**/coverage/**",
    "**/logs/**",
    "**/zip/**",
    "**/_checking_extracted/**",
    "**/backups/**",
    "**/origin/**",
    "**/original*.{js,jsx,mjs,cjs}",
    "**/*.min.{js,css}",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    plugins: {
      js,
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "react-refresh": pluginReactRefresh,
    },
    extends: ["js/recommended"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // ── Disable noisy rules for legacy codebase ──
      "react/prop-types": "off",
      "react-hooks/exhaustive-deps": "off",
      // ── JSX variable detection: prevent false positives on components used in JSX ──
      "react/jsx-uses-react": "off",   // React 17+ JSX transform (no React import needed)
      "react/jsx-uses-vars": "warn",   // Mark JSX-used vars as used (fixes false no-unused-vars)
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_|^T$",
      }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "react/no-unescaped-entities": "warn",
      "react/react-in-jsx-scope": "off",
      "no-redeclare": "off",
    }
  }
]);
