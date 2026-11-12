"""Turn a `ruff check --output-format json` report into a per-file-ignores baseline.

Usage (from the project root, with the pinned Ruff version):
    ruff check . --no-cache --output-format json > ruff.json
    python ruff-baseline.py ruff.json > baseline.toml
One entry per file with the rule codes it already breaks, and how many times.
"""
import json
import os
import sys
from collections import Counter, defaultdict

issues = json.load(open(sys.argv[1], encoding="utf-8"))
root = os.getcwd()
per_file = defaultdict(Counter)
for i in issues:
    path = os.path.relpath(i["filename"], root).replace(os.sep, "/")
    per_file[path][i["code"]] += 1

print("[tool.ruff.lint.per-file-ignores]")
print(f"# Baseline: {len(issues)} issues in {len(per_file)} files. Do not add entries by hand.")
for path in sorted(per_file):
    codes = per_file[path]
    detail = ", ".join(f"{c} x{n}" for c, n in sorted(codes.items()))
    rules = ", ".join(f'"{c}"' for c in sorted(codes))
    print(f'"{path}" = [{rules}]  # {detail}')
