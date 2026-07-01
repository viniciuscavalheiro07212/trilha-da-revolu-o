import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["dist/", "node_modules/", "assets/", "public/", "docs/"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.browser,
    },
  },
  {
    files: ["*.config.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.node,
    },
  },
];
