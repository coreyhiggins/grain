'use strict';

// Where the per-invocation time goes.
//
//   node bench/startup.cjs
//
// The hook is a command hook, so every turn pays a fresh node process. That
// floor is not something grain controls. What grain does control is what it
// loads and reads before it can answer, and that turned out to be most of the
// gap above the floor.

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RUNS = 10;

function time(label, args, input) {
  // Warm once so disk caches are not part of the first number.
  try { execFileSync('node', args, { cwd: ROOT, input, encoding: 'utf8' }); } catch { /* fine */ }
  const start = process.hrtime.bigint();
  for (let i = 0; i < RUNS; i += 1) {
    try { execFileSync('node', args, { cwd: ROOT, input, encoding: 'utf8' }); } catch { /* fine */ }
  }
  const ms = Number(process.hrtime.bigint() - start) / 1e6 / RUNS;
  console.log(`  ${label.padEnd(34)}${ms.toFixed(0).padStart(5)}ms`);
  return ms;
}

const PROBE = path.join(__dirname, 'probe.cjs');
const payload = JSON.stringify({
  prompt: 'refactor the parser and extract the escape logic',
  session_id: 'startup-bench',
  cwd: ROOT,
});

console.log('\nper-invocation cost breakdown\n');
const bare = time('bare node, nothing loaded', ['-e', '']);
const loaded = time('plus requiring the hook', [PROBE, 'require']);
const indexed = time('plus reading the skill index', [PROBE, 'index']);
const full = time('full hook, real payload', ['bin/grain.js', 'prompt-hook'], payload);

console.log('');
console.log(`  node floor grain cannot avoid    ${bare.toFixed(0).padStart(5)}ms`);
console.log(`  module loading                   ${(loaded - bare).toFixed(0).padStart(5)}ms`);
console.log(`  reading the cached index         ${(indexed - loaded).toFixed(0).padStart(5)}ms`);
console.log(`  routing and everything else      ${(full - indexed).toFixed(0).padStart(5)}ms`);
console.log('');
