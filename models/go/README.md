# CI model for a Go service

Reference implementation: `release-lab-core` (`.github/workflows/pipeline.yml`, `go-test.yml`, `.golangci.yml`).

```
lint ──┐
       ├──> publish   (publish-image.yml)
test ──┘
```

| Job | Where it lives | What it gates |
|---|---|---|
| `lint` | `golangci-lint.yml` in this repo, called by tag | Any issue that is not excluded in the caller's `.golangci.yml` |
| `test` | the service's own `go-test.yml` (`on: workflow_call`) | `go build` plus the full `go test`, integration build tags included, against the services it needs; a skipped test fails the job |
| `publish` | `publish-image.yml` in this repo | Runs only with `needs: [lint, test]` |

## Adopting it

1. Add a `.golangci.yml` with `version: "2"`, `linters.default: standard` and the same
   `run.build-tags` the tests use, so the files that run in CI are also linted.
2. Baseline the existing debt once with the pinned version:
   `golangci-lint run --uniq-by-line=false --output.json.path=lint.json --max-issues-per-linter=0 --max-same-issues=0 ./...`
   (`--uniq-by-line=false`: otherwise a second linter on the same line stays hidden and
   shows up once the first one is excluded), then `python golangci-baseline.py lint.json` (next to this file) prints one
   `linters.exclusions.rules` entry per file, linter and exact message. Paste it under
   `linters.exclusions` and run the linter again: it must report 0 issues.
3. Turn the test workflow into `workflow_call`. Start the database as a job service, pass its
   URL in the variable the integration tests read, run `go test -tags <tags> -v ./...` with
   `set -o pipefail`, and fail the job when the log has a `--- SKIP` line. A test that skips
   because its database is missing is a test that did not run.
4. Call both from `pipeline.yml`, with `publish` needing `[lint, test]`.
5. Require `lint / golangci-lint` and the test check on the default branch.

Services with an enterprise build (`go.community.mod`): pass `modfile: go.community.mod` to the
lint workflow and `-modfile=go.community.mod` to `go build`/`go test`.

## Limits

- An issue with the same text in a file that already has it in the baseline passes.
  Shrinking the baseline is the way out.
- Tests behind a build tag the CI cannot satisfy (for example `enterprise`, which needs the
  private SDK) still do not run here; they belong to the enterprise pipeline.
