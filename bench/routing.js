#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { route } = require('../src/route');

// The routing benchmark.
//
//   node bench/routing.js <corpus.json>
//
// This exists because grain shipped a classifier with no measurement of
// whether it classifies correctly. The prose detector had a benchmark and got
// caught failing. The router had tests, which proved it behaved consistently
// on prompts written to make it behave consistently. That is not the same
// thing, and an outside review found real everyday prompts producing silence.
//
// THREE OUTCOMES, NOT TWO.
//
// A router that can abstain has three results, and collapsing them into one
// accuracy number hides the tradeoff that actually matters:
//
//   RIGHT    injected guidance the prompt wanted
//   SILENT   injected nothing when something would have helped
//   WRONG    injected guidance for a discipline the prompt was not about
//
// These are not equally bad. Silence costs an opportunity. A wrong injection
// costs tokens AND points the model at the wrong discipline, so it is worse
// than saying nothing. Any change that converts silence into wrong answers is
// a regression even if a single accuracy figure goes up.
//
// The corpus carries multi-label ground truth, because real requests are
// often two things at once and scoring them single-label builds the same
// mistake into the measurement.

const THRESHOLDS = [
  { minScore: 2, minMargin: 1 },
  { minScore: 3, minMargin: 1 },
  { minScore: 3, minMargin: 2 }, // current default
  { minScore: 4, minMargin: 2 },
  { minScore: 5, minMargin: 3 },
];

function loadCorpus(file) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) {
    console.error(`cannot read ${file}: ${err.message}`);
    process.exit(1);
  }
  const items = Array.isArray(raw) ? raw : raw.prompts || raw.items;
  if (!items || !items.length) {
    console.error('corpus has no prompts');
    process.exit(1);
  }
  for (const item of items) {
    if (!Array.isArray(item.labels)) {
      console.error(`${item.id || item.text}: missing a "labels" array. Use [] for "should stay silent".`);
      process.exit(1);
    }
  }
  return items;
}

/** Score the router over the corpus at one threshold setting. */
function evaluate(items, thresholds) {
  const config = { thresholds };
  const counts = {
    right: 0, silent: 0, wrong: 0, correctlySilent: 0, spurious: 0,
  };
  const perLabel = {};
  const failures = [];

  const bump = (label, key) => {
    perLabel[label] = perLabel[label] || { tp: 0, fp: 0, fn: 0 };
    perLabel[label][key] += 1;
  };

  for (const item of items) {
    const decision = route(item.text, config);
    const got = decision ? decision.mode : null;
    const want = item.labels;

    if (!want.length) {
      // Should have stayed quiet.
      if (!got) counts.correctlySilent += 1;
      else { counts.spurious += 1; bump(got, 'fp'); failures.push({ item, got, kind: 'spurious' }); }
      continue;
    }

    if (!got) {
      counts.silent += 1;
      for (const label of want) bump(label, 'fn');
      failures.push({ item, got, kind: 'silent' });
      continue;
    }

    if (want.includes(got)) {
      counts.right += 1;
      bump(got, 'tp');
      // Multi-label prompts where only one label was served still miss the rest.
      for (const label of want) if (label !== got) bump(label, 'fn');
    } else {
      counts.wrong += 1;
      bump(got, 'fp');
      for (const label of want) bump(label, 'fn');
      failures.push({ item, got, kind: 'wrong' });
    }
  }

  const shouldSpeak = items.filter((i) => i.labels.length).length;
  const shouldBeQuiet = items.length - shouldSpeak;

  return {
    counts,
    perLabel,
    failures,
    shouldSpeak,
    shouldBeQuiet,
    coverage: shouldSpeak ? counts.right / shouldSpeak : 0,
    wrongRate: shouldSpeak ? counts.wrong / shouldSpeak : 0,
    silenceRate: shouldSpeak ? counts.silent / shouldSpeak : 0,
    quietPrecision: shouldBeQuiet ? counts.correctlySilent / shouldBeQuiet : 1,
  };
}

const pct = (n) => `${(n * 100).toFixed(0)}%`;

function main() {
  const file = process.argv[2] || path.join(__dirname, 'routing-corpus.json');
  const items = loadCorpus(file);

  const multi = items.filter((i) => i.labels.length > 1).length;
  const quiet = items.filter((i) => !i.labels.length).length;
  const followups = items.filter((i) => i.context === 'followup').length;

  console.log('\ngrain routing benchmark');
  console.log('='.repeat(72));
  console.log(`\n  ${items.length} prompts: ${items.length - quiet} want guidance `
    + `(${multi} of them want more than one), ${quiet} should get silence`);
  console.log(`  ${followups} are follow-ups that depend on an earlier turn\n`);

  console.log('  thresholds        right   silent    wrong   quiet-ok');
  let best = null;
  for (const t of THRESHOLDS) {
    const r = evaluate(items, t);
    const label = `score>=${t.minScore} margin>=${t.minMargin}`;
    const isDefault = t.minScore === 3 && t.minMargin === 2;
    console.log(`  ${(label + (isDefault ? ' *' : '')).padEnd(20)}`
      + `${pct(r.coverage).padStart(5)}${pct(r.silenceRate).padStart(9)}`
      + `${pct(r.wrongRate).padStart(9)}${pct(r.quietPrecision).padStart(11)}`);
    if (!best || r.coverage - r.wrongRate > best.score) {
      best = { score: r.coverage - r.wrongRate, thresholds: t, result: r };
    }
  }
  console.log('\n  * current default. "right" counts a prompt as served if the injected');
  console.log('  mode is any of its true labels, so a compound request scores as right');
  console.log('  even when only half of what it needed arrived.');

  const r = evaluate(items, { minScore: 3, minMargin: 2 });

  console.log('\n  per mode, at the current default');
  console.log(`    ${'mode'.padEnd(16)}${'prec'.padStart(6)}${'recall'.padStart(9)}${'F1'.padStart(7)}`);
  for (const [mode, c] of Object.entries(r.perLabel).sort()) {
    const p = c.tp + c.fp ? c.tp / (c.tp + c.fp) : 0;
    const rec = c.tp + c.fn ? c.tp / (c.tp + c.fn) : 0;
    const f1 = p + rec ? (2 * p * rec) / (p + rec) : 0;
    console.log(`    ${mode.padEnd(16)}${p.toFixed(2).padStart(6)}${rec.toFixed(2).padStart(9)}${f1.toFixed(2).padStart(7)}`);
  }

  // Where it fails, split by context, because a follow-up failing is a
  // different bug from a standalone prompt failing and needs a different fix.
  const silentFollowups = r.failures.filter((f) => f.kind === 'silent' && f.item.context === 'followup').length;
  const silentCompound = r.failures.filter((f) => f.kind === 'silent' && f.item.labels.length > 1).length;
  const totalFollowups = items.filter((i) => i.context === 'followup' && i.labels.length).length;
  const totalCompound = items.filter((i) => i.labels.length > 1).length;

  console.log('\n  where the silence falls');
  console.log(`    compound requests   ${silentCompound}/${totalCompound} got nothing`);
  console.log(`    follow-up turns     ${silentFollowups}/${totalFollowups} got nothing`);

  console.log('\n  a sample of what it missed');
  for (const f of r.failures.filter((x) => x.kind === 'silent').slice(0, 8)) {
    console.log(`    ${'(silent)'.padEnd(10)} want ${f.item.labels.join('+').padEnd(24)} ${JSON.stringify(f.item.text).slice(0, 60)}`);
  }
  for (const f of r.failures.filter((x) => x.kind === 'wrong').slice(0, 5)) {
    console.log(`    ${`(${f.got})`.padEnd(10)} want ${f.item.labels.join('+').padEnd(24)} ${JSON.stringify(f.item.text).slice(0, 60)}`);
  }
  for (const f of r.failures.filter((x) => x.kind === 'spurious').slice(0, 5)) {
    console.log(`    ${`(${f.got})`.padEnd(10)} want ${'silence'.padEnd(24)} ${JSON.stringify(f.item.text).slice(0, 60)}`);
  }

  console.log('');
  if (r.wrongRate > 0.1) {
    console.log(`  WARNING: ${pct(r.wrongRate)} of prompts that wanted guidance got the wrong`);
    console.log('  discipline. That is worse than silence and should be fixed first.\n');
    process.exitCode = 1;
  }
  console.log('  Labels in this corpus were assigned by the author of the tool.');
  console.log('  Disagree with one and open an issue: the corpus is the argument.\n');
}

if (require.main === module) main();

module.exports = { evaluate, loadCorpus };
