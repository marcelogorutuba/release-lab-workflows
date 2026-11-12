#!/usr/bin/env node
// Every Vitest spec under src/ must be in exactly one of ci/vitest-list.txt (runs in CI) or
// ci/vitest-exclusions.txt (does not, with an owner and a reason). Run by the pre-push hook
// (lefthook.yml) and by the "Spec list" CI check, which also catches `git push --no-verify`.
//
//   node ci/check-vitest-list.mjs          check, exit 1 on any problem
//   node ci/check-vitest-list.mjs --print  print the CI list, one path per line
//
// The spec pattern mirrors `test.include` in vitest.config.ts; change both together.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const LIST = 'ci/vitest-list.txt';
const EXCLUSIONS = 'ci/vitest-exclusions.txt';
const SPEC = /\.spec\.tsx?$/;
const annotate = process.env.GITHUB_ACTIONS === 'true';

function entries(file) {
  return readFileSync(join(root, file), 'utf8')
    .split(/\r?\n/)
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => line && !line.startsWith('#'));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SPEC.test(name)) out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

const listed = entries(LIST).map(({ line, n }) => ({ path: line, n }));

if (process.argv.includes('--print')) {
  if (listed.length === 0) {
    console.error(`${LIST} is empty: vitest would run the whole suite.`);
    process.exit(1);
  }
  console.log(listed.map(e => e.path).join('\n'));
  process.exit(0);
}

const problems = [];
const fail = (file, n, msg) => problems.push({ file, n, msg });

const excluded = entries(EXCLUSIONS).map(({ line, n }) => {
  const [path = '', owner = '', reason = ''] = line.split('|').map(s => s.trim());
  if (!owner || !reason) fail(EXCLUSIONS, n, `"${path}" needs "<path> | <owner> | <reason>"`);
  return { path, n };
});

if (listed.length === 0) fail(LIST, 1, 'the CI list is empty: vitest would run the whole suite');

const seen = new Map();
for (const [file, items] of [[LIST, listed], [EXCLUSIONS, excluded]]) {
  for (const { path, n } of items) {
    if (!SPEC.test(path)) fail(file, n, `"${path}" is not a spec file`);
    else if (!existsSync(join(root, path))) fail(file, n, `"${path}" does not exist anymore; remove the line`);
    if (seen.has(path)) fail(file, n, `"${path}" is already in ${seen.get(path)}; keep it in one place`);
    else seen.set(path, file);
  }
}

const unlisted = walk(join(root, 'src')).filter(p => !seen.has(p)).sort();
for (const p of unlisted) {
  fail(p, 1, `spec is in neither ${LIST} nor ${EXCLUSIONS}: add it to the CI list (with a comment on what it guards), or exclude it with an owner and a reason`);
}

if (problems.length === 0) {
  console.log(`OK: ${listed.length} specs in the CI list, ${excluded.length} excluded with an owner and a reason.`);
  process.exit(0);
}
for (const { file, n, msg } of problems) {
  console.error(annotate ? `::error file=${file},line=${n}::${msg}` : `${file}:${n}: ${msg}`);
}
console.error(`\n${problems.length} problem(s) in the Vitest spec list.`);
process.exit(1);
