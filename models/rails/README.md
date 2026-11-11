# CI model for a Rails service

Reference implementation: `release-lab-auth` (`.github/workflows/pipeline.yml`, `test.yml`, `smoke-fresh.yml`).

```
lint ──┐
test ──┼──> publish   (publish-image.yml)
smoke ─┘
```

| Job | Where it lives | What it gates |
|---|---|---|
| `lint` | `rubocop.yml` in this repo, called by tag | Any offense that is not in the caller's `.rubocop_todo.yml` |
| `test` | the service's own `test.yml` (`on: workflow_call`) | The full RSpec suite; exclusions are listed in the file with reason and owner |
| `smoke` | the service's own smoke workflow (`on: workflow_call`) | The image built **from this commit** boots on an empty database and answers its health and readiness probes |
| `publish` | `publish-image.yml` in this repo | Runs only with `needs: [lint, test, smoke]` |

## Adopting it

1. Baseline the existing debt once, with the Ruby and `Gemfile.lock` of the service:
   `bundle exec rubocop --auto-gen-config --no-exclude-limit --no-auto-gen-timestamp`.
   `--no-exclude-limit` keeps every cop enabled with a per-file list; without it a cop with
   many offending files is switched off for the whole repository.
2. An inline `# rubocop:enable` forces a cop on even when the config disables it, and the
   baseline cannot exclude it. Remove stale disable/enable pairs before generating.
3. Turn `test.yml` and the smoke workflow into `workflow_call` and call them from `pipeline.yml`.
   The smoke must build the image from the checked-out code (same build args as the
   publisher) and run on every pipeline, without a `paths` filter.
4. Require `lint / RuboCop`, `test / RSpec` and the smoke check on the default branch.

## Limits

- A new offense in a file that is already listed for the same cop in the baseline passes.
  Shrinking the baseline is the way out; most entries are safe autocorrections.
- The smoke builds its own copy of the image; the published one is a separate build of the
  same commit. The release candidate image itself is checked by the release barrier.
