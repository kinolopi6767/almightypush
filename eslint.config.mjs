import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";
import drizzle from "eslint-plugin-drizzle";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/.drizzle/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: globals.node },
  },
  {
    plugins: { drizzle },
    rules: {
      "drizzle/enforce-delete-with-where": "warn",
      "drizzle/enforce-update-with-where": "warn",
    },
  },
  prettier,
);