# CI model for a Rails service

Reference implementations:
- `release-lab-auth`: `.github/workflows/pipeline.yml`, `test.yml`, `smoke-fresh.yml`; three exclusions written in `test.yml`.
- `release-lab-crm`: the same jobs plus two extra RSpec lanes; many exclusions, kept in
  `spec/ci_exclusions.txt` and applied by `bin/ci-rspec`.

```
lint ──┐
test ──┼──> publish   (publish-image.yml)
smoke ─┘
```

| Job | Where it lives | What it gates |
|---|---|---|
| `lint` | `rubocop.yml` in this repo, called by tag | Any offense that is not in the caller's `.rubocop_todo.yml` |
| `test` | the service's own `test.yml` (`on: workflow_call`) | The full RSpec suite; exclusions are written down with reason and owner |
| `smoke` | the service's own smoke workflow (`on: workflow_call`) | The image built **from this commit** boots on an empty database and answers its health and readiness probes |
| `publish` | `publish-image.yml` in this repo | Runs only with `needs` on every job above |

## Adopting it

1. Baseline the existing debt once, with the Ruby and `Gemfile.lock` of the service:
   `bundle exec rubocop --auto-gen-config --no-exclude-limit --no-auto-gen-timestamp`.
   `--no-exclude-limit` keeps every cop enabled with a per-file list; without it a cop with
   many offending files is switched off for the whole repository.
2. If `.rubocop.yml` has its own `Exclude` list for a cop, that list replaces the baseline's
   for the same cop. Add `inherit_mode: { merge: [Exclude] }` before generating.
3. An inline `# rubocop:enable` forces a cop on even when the config excludes the file, and
   a `# rubocop:disable` for a baselined cop becomes a redundant-directive offense. Remove
   those directives, generate, and check that `bundle exec rubocop` reports no offenses.
   Move any hand-written settings out of an old todo file first; generating replaces it.
4. Run the whole suite. When some specs are red, either list them in `test.yml` (a few) or
   use an exclusion file (many): one line per spec with path, mode (`skip`, or `alone` for a
   spec that only fails inside the full run), owner and reason, and a runner that rejects a
   line without them or pointing to a missing file. A new spec then runs by default.
5. Turn `test.yml` and the smoke workflow into `workflow_call` and call them from `pipeline.yml`.
   The smoke must build the image from the checked-out code (same build args as the
   publisher) and run on every pipeline, without a `paths` filter.
6. Require the lint, test and smoke checks on the default branch.

## Limits

- A new offense in a file that is already listed for the same cop in the baseline passes.
  Shrinking the baseline is the way out; most entries are safe autocorrections.
- A required check whose workflow has a `paths` filter never reports on the pull requests it
  skips, and they stay blocked. Gate with jobs that always run.
- The smoke builds its own copy of the image; the published one is a separate build of the
  same commit. The release candidate image itself is checked by the release barrier.
