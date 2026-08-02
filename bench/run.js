#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { analyze } = require('../src/analyze');
const {
  emDashOnly, cheapPhraseGrep, alwaysMachine, coinFlip, score, bootstrapF1, mulberry32,
} = require('./baselines');

// The benchmark.
//
//   node bench/run.js <corpus-dir>
//
// grain's claim is narrow and testable: its findings appear more often in
// machine-written prose than in prose a person wrote. This measures that and
// refuses to measure anything softer.
//
// Five rules, each one a direct answer to a hole found in a competing
// project's published numbers:
//
//   1. HOUSE RULES ARE OFF. Those answer "does this match your project",
//      which is a different claim, and mixing them in would inflate this one.
//   2. THE THRESHOLD IS PICKED ON A CALIBRATION SPLIT AND SCORED ON A HOLDOUT
//      IT NEVER SAW. Tuning and reporting on the same files is how you
//      publish a number that nobody else can reproduce.
//   3. CHEAP BASELINES RUN ALONGSIDE. If searching for an em dash scores what
//      grain scores, grain is not worth installing and this table says so.
//   4. CONFIDENCE INTERVALS, not point estimates. No project in this category
//      publishes variance. A single run is an anecdote with a decimal point.
//   5. PER-RULE NUMBERS ARE PUBLISHED, INCLUDING THE DUDS. A detector that
//      fires equally on both buckets is detecting nothing, and hiding that
//      would make every other number here untrustworthy.
//
// The corpus directory needs a manifest.json giving every file a bucket, a
// source, and a reason the label holds. See bench/README.md.

const RATE_UNIT = 1000;
const THRESHOLDS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
const SPLIT_SEED = 20260801;

function loadCorpus(dir) {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`No manifest.json in ${dir}.`);
    console.error('The manifest is not optional. A benchmark whose labels cannot be checked is an assertion.');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const meta = Array.isArray(manifest) ? {} : manifest;

  // Three shapes are accepted: a bare array, a `files` array, or separate
  // `human` and `machine` arrays. Assembling a corpus is enough work without
  // also having to guess the one layout a tool will read.
  const entries = Array.isArray(manifest) ? manifest
    : manifest.files ? manifest.files
      : [...(manifest.human || []), ...(manifest.machine || [])];

  if (!entries.length) {
    console.error(`manifest.json in ${dir} lists no files.`);
    process.exit(1);
  }

  const items = [];
  for (const entry of entries) {
    // Paths may be written relative to the corpus directory or to its parent,
    // depending on where the manifest was authored. Try both before giving up.
    const candidates = [
      path.resolve(dir, entry.path),
      path.resolve(dir, '..', entry.path),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) {
      console.error(`missing: ${entry.path}`);
      continue;
    }

    let text;
    try { text = fs.readFileSync(found, 'utf8'); } catch { continue; }

    // House rules off. This measures the universal claim only.
    const result = analyze(text, { profile: null });
    items.push({
      ...entry,
      text,
      words: result.words,
      findings: result.tells,
      rate: result.words ? (result.tells.length / result.words) * RATE_UNIT : 0,
    });
  }
  return { items, meta };
}

/** Deterministic halves, so the split is identical on every machine. */
function split(items) {
  const rand = mulberry32(SPLIT_SEED);
  const shuffled = [...items].sort((a, b) => a.path.localeCompare(b.path));
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const half = Math.ceil(shuffled.length / 2);
  return { calibration: shuffled.slice(0, half), holdout: shuffled.slice(half) };
}

const grainAt = (threshold) => (text, item) => item.rate >= threshold;

function row(label, s, ci) {
  const band = ci ? `  [${ci.low.toFixed(2)}, ${ci.high.toFixed(2)}]` : '';
  return `    ${label.padEnd(26)}${s.precision.toFixed(2).padStart(6)}${s.recall.toFixed(2).padStart(9)}`
    + `${s.f1.toFixed(2).padStart(6)}${band}`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node bench/run.js <corpus-dir>');
    process.exit(1);
  }

  const { items, meta } = loadCorpus(dir);
  const human = items.filter((i) => i.bucket === 'human');
  const machine = items.filter((i) => i.bucket === 'machine');

  if (human.length < 4 || machine.length < 4) {
    console.error(`Need at least 4 files per bucket. Found ${human.length} human, ${machine.length} machine.`);
    process.exit(1);
  }

  console.log('\ngrain benchmark');
  console.log('='.repeat(70));

  if (meta.caveat) {
    console.log(`\n  CAVEAT: ${meta.caveat}\n`);
  }

  const hWords = human.reduce((a, i) => a + i.words, 0);
  const mWords = machine.reduce((a, i) => a + i.words, 0);
  console.log(`  corpus   human ${human.length} files / ${hWords.toLocaleString()} words`
    + `   machine ${machine.length} files / ${mWords.toLocaleString()} words`);

  const hRate = (human.reduce((a, i) => a + i.findings.length, 0) / hWords) * RATE_UNIT;
  const mRate = (machine.reduce((a, i) => a + i.findings.length, 0) / mWords) * RATE_UNIT;
  console.log(`  findings per 1,000 words:  human ${hRate.toFixed(2)}   machine ${mRate.toFixed(2)}`
    + `   (${hRate ? `${(mRate / hRate).toFixed(1)}x` : 'n/a'})`);

  // Threshold chosen on calibration only. The holdout stays untouched until
  // the choice is locked, which is the whole point of splitting.
  const { calibration, holdout } = split(items);
  let best = { threshold: THRESHOLDS[0], f1: -1 };
  console.log('\n  threshold sweep (calibration half only, holdout not consulted)');
  console.log(`    ${'findings/1k >='.padEnd(26)}${'prec'.padStart(6)}${'recall'.padStart(9)}${'F1'.padStart(6)}`);
  for (const t of THRESHOLDS) {
    const s = score(calibration, grainAt(t));
    console.log(row(String(t), s));
    if (s.f1 > best.f1) best = { threshold: t, f1: s.f1 };
  }
  console.log(`\n  locked threshold: ${best.threshold} findings per 1,000 words`);

  console.log('\n  HOLDOUT (never used to pick anything above)');
  console.log(`    ${'detector'.padEnd(26)}${'prec'.padStart(6)}${'recall'.padStart(9)}${'F1'.padStart(6)}   95% CI on F1`);

  const grainPredict = grainAt(best.threshold);
  const grainScore = score(holdout, grainPredict);
  const grainCI = bootstrapF1(holdout, grainPredict);
  console.log(row('grain', grainScore, grainCI));

  const controls = [
    ['em dash search only', emDashOnly],
    ['em dash + 5 stock words', cheapPhraseGrep],
    ['always say machine', alwaysMachine],
    ['coin flip (seeded)', coinFlip(7)],
  ];
  let bestControl = { label: 'none', f1: 0 };
  for (const [label, fn] of controls) {
    const s = score(holdout, fn);
    console.log(row(label, s, bootstrapF1(holdout, fn)));
    if (s.f1 > bestControl.f1) bestControl = { label, f1: s.f1 };
  }

  // A confidence interval this wide means the holdout is too small for the
  // point estimate to mean anything. Better to say that out loud than to let
  // someone quote the F1 without the band next to it.
  const width = grainCI.high - grainCI.low;
  console.log('');
  if (width > 0.35) {
    console.log(`  WARNING: the 95% interval spans ${width.toFixed(2)} F1. The holdout is too small`);
    console.log('  for the point estimate above to be quotable. Add files before publishing it.');
  }

  // The comparison that decides whether this project deserves to exist.
  //
  // The first version of this compared grain only against the two text
  // searches and quietly skipped "always say machine". That is the same
  // motivated choice this harness exists to catch: on a near-balanced corpus
  // the always-yes baseline scores a high F1 for free, and excluding it from
  // the verdict flatters the tool. It is included now. If grain cannot beat
  // a predictor that has no logic in it at all, grain has not earned an
  // install, whatever the other rows say.
  const margin = grainScore.f1 - bestControl.f1;
  console.log('');
  if (margin < 0.05) {
    console.log(`  VERDICT: grain does not meaningfully beat "${bestControl.label}"`);
    console.log(`  (${bestControl.f1.toFixed(2)} F1 against grain's ${grainScore.f1.toFixed(2)}).`);
    console.log('  On this corpus the extra machinery is not earning its install, and the');
    console.log('  README should say so rather than wait for someone to find out.');
    process.exitCode = 1;
  } else {
    console.log(`  grain beats the best control ("${bestControl.label}", ${bestControl.f1.toFixed(2)}) by ${margin.toFixed(2)} F1.`);
  }

  // Per-rule table. The human column is the false positive rate: every count
  // in it is grain being wrong about prose a person actually wrote.
  console.log('\n  per rule, findings per 1,000 words');
  console.log(`    ${'rule'.padEnd(26)}${'human'.padStart(8)}${'machine'.padStart(10)}${'verdict'.padStart(15)}`);
  const byRule = (list) => {
    const acc = {};
    for (const i of list) for (const f of i.findings) acc[f.rule] = (acc[f.rule] || 0) + 1;
    return acc;
  };
  const H = byRule(human);
  const M = byRule(machine);
  for (const rule of [...new Set([...Object.keys(H), ...Object.keys(M)])].sort()) {
    const h = ((H[rule] || 0) / hWords) * RATE_UNIT;
    const m = ((M[rule] || 0) / mWords) * RATE_UNIT;
    const verdict = m > h * 3 ? 'discriminates'
      : m > h * 1.5 ? 'weak'
        : h > m * 1.5 ? 'INVERTED'
          : 'no signal';
    console.log(`    ${rule.padEnd(26)}${h.toFixed(2).padStart(8)}${m.toFixed(2).padStart(10)}${verdict.padStart(15)}`);
  }

  console.log('\n  A rule marked INVERTED fires more on human prose than machine prose.');
  console.log('  It is not detecting what it claims to and should be cut.\n');
}

if (require.main === module) main();

module.exports = { loadCorpus, split, grainAt };
