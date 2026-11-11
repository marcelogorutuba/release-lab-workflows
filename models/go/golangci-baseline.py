"""Turn a golangci-lint JSON report into `linters.exclusions.rules` for .golangci.yml.

Usage: python golangci-baseline.py lint.json > rules.yml
One rule per (file, linter, message); repeated messages in the same file collapse into one.
"""
import json
import re
import sys
from collections import Counter

issues = json.load(open(sys.argv[1], encoding="utf-8"))["Issues"] or []
seen = Counter((i["Pos"]["Filename"], i["FromLinter"], i["Text"]) for i in issues)


def esc(s):
    # Go RE2 rejects escapes of non-punctuation (Python's re.escape escapes spaces).
    return re.sub(r"([\\.+*?()|\[\]{}^$])", r"\\\1", s)


def q(s):
    return "'" + s.replace("'", "''") + "'"


print(f"    # Baseline: {len(issues)} issues in {len({k[0] for k in seen})} files. Do not add entries by hand.")
print("    rules:")
for (path, linter, text), _ in sorted(seen.items()):
    print(f"      - path: {q('^' + esc(path) + '$')}")
    print(f"        linters: [{linter}]")
    print(f"        text: {q('^' + esc(text) + '$')}")
