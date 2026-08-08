"use strict";

/**
 * simple-conventional-commit lint for this repo.
 * Rules (see BUILD-PLAN §22): Conventional Commits; body wrapped at 100 cols.
 * Runs on every commit message; fails the commit with a friendly hint.
 */
module.exports = {
  prompt: false,
  rules: {
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "chore", "docs", "style", "refactor", "perf", "test", "build", "ci", "revert"],
    ],
    "subject-case": [1, "always", "sentence-case"],
    "body-max-line-length": [1, "always", 100],
  },
  helpMessage:
    "Commit message must follow Conventional Commits: `type(scope?): subject`\n" +
    "e.g. `feat(db): add migrations`, `fix(web): session cookie on reload`.\n" +
    "If you must skip, use `git commit --no-verify`.",
};