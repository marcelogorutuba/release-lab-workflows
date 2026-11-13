#!/usr/bin/env node
// Reads jest --json reports and fails unless every test passed or is covered by
// ci/test-exceptions.txt with the outcome its class promises. A skipped test without
// an exception, a failure without one, and an exception that no longer matches all fail.
// Usage: node ci/check-test-results.mjs <report.json>...
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { relative } from 'node:path';

const EXCEPTIONS = 'ci/test-exceptions.txt';
const CLASSES = {
  'known-failure': 'runs and fails today; a card tracks the fix',
  'not-runnable-here': 'needs something this repository does not have',
  'non-blocking': 'skipped on purpose by the repository',
};
const SKIPPED = new Set(['pending', 'skipped', 'todo', 'disabled']);

const errors = [];
const exceptions = [];
readFileSync(EXCEPTIONS, 'utf8').split(/\r?\n/).forEach((raw, i) => {
  const line = raw.trim();
  if (!line || line.startsWith('#')) return;
  const where = `${EXCEPTIONS}:${i + 1}`;
  const f = line.split('|').map((s) => s.trim());
  if (f.length !== 5 || f.some((x) => !x)) {
    errors.push(`${where}: expected "file | test | class | owner | reason", got: ${line}`);
    return;
  }
  const [file, test, cls, owner, reason] = f;
  if (!CLASSES[cls]) errors.push(`${where}: unknown class "${cls}" (use ${Object.keys(CLASSES).join(', ')})`);
  if (!existsSync(file)) errors.push(`${where}: ${file} does not exist; delete the line`);
  exceptions.push({ file, test, cls, owner, reason, where, hits: 0, outcomes: new Set() });
});

const reports = process.argv.slice(2);
if (!reports.length) errors.push('no jest report given');
const results = [];
for (const r of reports) {
  if (!existsSync(r)) { errors.push(`${r}: report missing (jest did not finish)`); continue; }
  const j = JSON.parse(readFileSync(r, 'utf8'));
  if (!j.numTotalTestSuites) errors.push(`${r}: no test suite ran`);
  for (const s of j.testResults) {
    const file = relative(process.cwd(), s.name).split('\\').join('/');
    if (!s.assertionResults.length && s.status === 'failed') {
      results.push({ file, test: '*', status: 'failed', detail: (s.message || '').split('\n').find((l) => l.trim()) });
    }
    for (const a of s.assertionResults) results.push({ file, test: a.fullName, status: a.status });
  }
}

const find = (file, test) =>
  exceptions.find((e) => e.file === file && e.test === test) ||
  exceptions.find((e) => e.file === file && e.test === '*');

let passed = 0;
for (const t of results) {
  const e = find(t.file, t.test);
  const skipped = SKIPPED.has(t.status);
  if (e) { e.hits++; e.outcomes.add(skipped ? 'skipped' : t.status); }
  if (t.status === 'passed') {
    if (e) errors.push(`${e.where}: "${t.file} › ${t.test}" passes now; delete the exception`);
    else passed++;
  } else if (t.status === 'failed') {
    if (!e || e.cls !== 'known-failure') errors.push(`FAILED ${t.file} › ${t.test}${t.detail ? ` (${t.detail.trim()})` : ''}`);
  } else if (skipped) {
    if (!e || e.cls === 'known-failure') errors.push(`SKIPPED without an exception: ${t.file} › ${t.test}`);
  }
}
for (const e of exceptions) if (!e.hits) errors.push(`${e.where}: matches no test in the reports; delete the line`);

const out = [`Passed: ${passed} tests`];
for (const cls of Object.keys(CLASSES)) {
  const list = exceptions.filter((e) => e.cls === cls && e.hits);
  if (!list.length) continue;
  out.push('', `Exceptions, ${cls} (${CLASSES[cls]}):`);
  for (const e of list) out.push(`  - ${e.file} › ${e.test} [${[...e.outcomes].join(', ')} x${e.hits}] owner ${e.owner}: ${e.reason}`);
}
if (errors.length) out.push('', `Errors (${errors.length}):`, ...errors.map((x) => `  - ${x}`));
console.log(out.join('\n'));
for (const x of errors) console.log(`::error::${x}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
process.exit(errors.length ? 1 : 0);
