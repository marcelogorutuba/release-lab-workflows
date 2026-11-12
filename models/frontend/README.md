# CI model for a frontend (React + Vite + Vitest)

Reference implementation: `release-lab-frontend` (`.github/workflows/pipeline.yml`, `test.yml`,
`ci/vitest-list.txt`, `ci/vitest-exclusions.txt`, `ci/check-vitest-list.mjs`, `lefthook.yml`).

```
test (spec list, vitest, typecheck + build, eslint) ──┐
guards (repo-specific, e.g. no-enterprise-guard) ─────┼──> publish   (publish-image.yml)
```

| Job | What it gates |
|---|---|
| `Spec list` | Every `src/**/*.spec.ts(x)` is in the CI list or in the exclusion file with an owner and a reason; an exclusion that names a missing file, has no owner/reason, or is also listed fails |
| `Vitest (CI list)` | The specs in `ci/vitest-list.txt` |
| `Typecheck and build` | `npm run build` (`tsc -b` + `vite build`). `tsc --noEmit` checks nothing when the root tsconfig has `"files": []` |
| `ESLint` | The whole repository against the `eslint-suppressions.json` baseline, `--max-warnings=0`, on pull requests and pushes |
| `publish` | Runs only with `needs:` on all of the above; `version-build-arg` puts the resolved version in the bundle |

## Adopting it

1. Prefer the whole suite: run `npx vitest run` once on the runner and write down the time,
   the memory peak and the failures. Keep a list only when the whole suite does not fit, and
   say why at the top of the list file, with the numbers.
2. With a list: move it out of the workflow into `ci/vitest-list.txt` (one path per line, `#`
   comments for what each entry guards) and put every other spec in `ci/vitest-exclusions.txt`
   as `<path> | <owner> | <reason>`, from that measurement (passes / fails and why). Copy
   `check-vitest-list.mjs` (next to this file) to `ci/`; its `SPEC` pattern mirrors
   `test.include` in `vitest.config.ts`.
3. Git hook: `npm install --save-dev --save-exact lefthook` and a `lefthook.yml` with
   `pre-push: node ci/check-vitest-list.mjs`. The package installs the hook on `npm ci` /
   `npm install` (not when `CI` is set, and without failing when there is no `.git`, as in a
   Docker build). The CI runs the same check, so a push with `--no-verify` is still caught.
4. ESLint: a baseline with `eslint --suppress-all` (`eslint-suppressions.json`) and the whole
   repository in CI. Linting only the changed files passes when nothing matching changed and
   leaves pushes unlinted.
5. Turn the test workflow into `workflow_call`, call it from `pipeline.yml`, `publish` needing
   every job; pass `version-build-arg` with the build-arg the Dockerfile reads.
6. Require the four checks (and the guards) on the default branch.

## Limits

- A list is a subset: a spec in the exclusion file does not run, even when it passes. The file
  is reviewed at every release.
- The version in the bundle is the one the image was built with. Promotion does not rebuild,
  so the final `X.Y.Z` image carries `X.Y.Z-rc.N` inside; the final version is in the tags and
  in the index annotation.
- A new ESLint violation of a rule a file already breaks, under the baseline count, passes only
  if another one of the same rule was fixed in the same file (the baseline counts per file and rule).
