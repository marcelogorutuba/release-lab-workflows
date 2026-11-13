# CI model for a Node/TypeScript backend

Reference implementation: `release-lab-flow` (`.github/workflows/pipeline.yml`, `ci.yml`,
`eslint-suppressions.json`, `ci/test-exceptions.txt`, `ci/check-test-results.mjs`,
`ci/README.md`).

```
ci / ESLint ─────┐
ci / Typecheck ──┤
ci / Test ───────┼──> publish   (publish-image.yml)
guards ──────────┘
```

| Job | What it gates |
|---|---|
| `ESLint` | The repository's own `eslint.config.mjs` on the whole repository, against `eslint-suppressions.json` |
| `Typecheck` | `tsc` over the whole project (`npm run typecheck`), not only what the tests import |
| `Test` | Every jest config (unit, integration, e2e) with the services the integration suites need running and their flags on; `check-test-results.mjs` fails on any failure or skip without a written exception |
| guards | Repository-specific checks, called with `workflow_call` so publish waits for them |
| `publish` | `needs:` every job above |

## Adopting it

1. ESLint: run the existing config once on the whole repository (`npx eslint "<globs>"`)
   and write down the numbers. Freeze the errors with `--suppress-all` (ESLint 9.24+),
   generated from a clean clone on Linux: an archive or checkout with CRLF line endings
   turns every line into a `prettier/prettier` error. Document the date, the commit, the
   count per rule and the owner next to the file (`ci/README.md`). Warnings stay warnings.
   A fixed error leaves an unused suppression and ESLint exits 2: `--prune-suppressions`.
2. Typecheck: check what `typecheck` really covers. `tsc -b` on a root tsconfig with
   `"files": []` checks nothing; prove it with a type error in a file no test imports.
3. Integration: find every suite that skips itself (`describe.skip` behind an env flag,
   `it.skip`, a separate jest config nobody runs). Start what they need as job services
   or with the repository's compose file (`up -d --wait`), turn every flag on, and run
   all jest configs once locally first. Create schemas the way the app does on boot and
   run the migrations on the clean database.
4. Exceptions: every test that does not pass goes into `ci/test-exceptions.txt` as
   `file | test | class | owner | reason` (`*` for a whole file), with one of three
   classes: `known-failure` (must fail; a card tracks the fix), `not-runnable-here` (needs
   something outside the repository; must be skipped), `non-blocking` (skipped on purpose;
   must be skipped). Copy `check-test-results.mjs` (next to this file) to `ci/`. Run the
   suites with `--json --outputFile`, ignore jest's exit code, and let the checker decide.
5. Turn the test workflow into `workflow_call`, call it and the guards from `pipeline.yml`,
   `publish` needing all of them, and delete the old publish workflow.
6. Require `ci / ESLint`, `ci / Typecheck`, `ci / Test` and the guards on the default branch.
   If the repository required the old job name, change the protection in the same change,
   or every pull request waits for a check that never reports.

## Limits

- The ESLint baseline counts per file and rule: one error swapped for another of the same
  rule in the same file passes.
- An exception does not run as a gate until its line is deleted; the owner reviews the
  file at every release cut. The checker fails when a line stops matching, so a fix
  forces the deletion.
- A test that silently checks nothing (an early `return`, an `expect(true)`) passes and is
  invisible to the checker; only a skipped or failed result is.
- Services in the job are the versions written in the workflow, not the ones in
  production; keep them in step with the deployment compose.
