# CI model for a Python service

Reference implementation: `release-lab-processor` (`.github/workflows/pipeline.yml`, `ci.yml`,
`[tool.ruff]` in `pyproject.toml`, `tests/conftest.py`, `tests/ci_exclusions.txt`).

```
lint ──┐
       ├──> publish   (publish-image.yml)
test ──┘
```

| Job | Where it lives | What it gates |
|---|---|---|
| `lint` | `ruff.yml` in this repo, called by tag | Any issue outside the caller's per-file-ignores baseline |
| `test` | the service's own test workflow (`on: workflow_call`) | The whole pytest suite (unit and integration) minus the written exclusions; a skipped test fails the job |
| `publish` | `publish-image.yml` in this repo | Runs only with `needs: [lint, test]` |

## Adopting it

1. In `pyproject.toml`, list the rules under `[tool.ruff.lint]` (`select = ["E4", "E7", "E9", "F"]`
   to start). Never rely on Ruff's default set: it changes between versions, and so would
   what blocks a merge.
2. Baseline the existing debt once, with the version `ruff.yml` pins, from the project root:
   `ruff check . --no-cache --output-format json > ruff.json`, then
   `python ruff-baseline.py ruff.json` (next to this file) prints a
   `[tool.ruff.lint.per-file-ignores]` table: one line per file with the rules it already
   breaks and how many times. Paste it under the rules with a comment saying when it was
   measured, who owns it, and which entries hide real bugs. Run Ruff again: `All checks passed!`.
3. Let pytest run the whole `tests/` tree (`testpaths`). A test that cannot run today goes
   into `tests/ci_exclusions.txt` as `test | owner | reason` (a file or a node id), applied by
   `tests/conftest.py`, which refuses to start when a line has no owner or reason or names a
   file or test that is gone. No `--ignore` or `--deselect` in the workflow.
4. Turn the test workflow into `workflow_call`, run `pytest -q -rs --junitxml=pytest-report.xml`
   and fail the job when the report has a skipped test. If the integration tests need a
   database or Redis, start it as a job service: a test that skips because its service is
   missing is a test that did not run.
5. Call both from `pipeline.yml`, with `publish` needing `[lint, test]`, and delete the old
   publish workflow.
6. Require `lint / ruff` and the test check on the default branch.

## Limits

- The baseline is per file and rule: a new issue of a rule a file already breaks passes.
  Shrinking the baseline is the way out.
- Formatting (`ruff format`, black) is not checked here.
- An excluded test does not run anywhere until its line is deleted; the owner reviews the
  list at every release cut.
