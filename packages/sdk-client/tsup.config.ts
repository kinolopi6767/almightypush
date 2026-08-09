import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "iife"],
  globalName: "PushPanel",
  outDir: "dist",
  clean: true,
  target: "es2018",
  dts: true,
  outExtension: ({ format }) => ({ js: format === "iife" ? ".global.js" : ".js" }),
});
