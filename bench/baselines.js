'use strict';

// The control arms.
//
// This file exists because of what happened to ponytail. Its headline claim
// was ~54% less code, and then someone opened issue #126 pointing out the
// baseline had no system prompt. Adding one sentence to the baseline took it
// from 108 lines to 16, against ponytail's 8.25. The tool was still ahead, but
// nothing like the headline said, and the maintainer had to rebuild the whole
// benchmark in public.
//
// The lesson generalises: a benchmark without a cheap control measures
// enthusiasm. So before grain is allowed to claim it detects machine prose,
// it has to beat the dumbest thing that could possibly work.
//
// If `grep -c "—"` scores within a point of grain's F1, then grain is a
// thousand lines of JavaScript wrapping a one-character search, and the
// honest move is to say so in the README rather than wait for someone to
// find out.

/** Deterministic RNG. Seeded so the published numbers reproduce exactly. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The one that matters. An em dash is the single most cited AI tell, and
 * anyone can search for one without installing anything.
 */
function emDashOnly(text) {
  return /[—–]/.test(text);
}

/**
 * The three most-repeated stock phrases, as a stand-in for the blocklists
 * people paste into their prompts. Still no code required.
 */
const CHEAP_PHRASES = ['delve', 'it\'s worth noting', 'in conclusion', 'testament to', 'seamless'];
function cheapPhraseGrep(text) {
  const lower = text.toLowerCase();
  return /[—–]/.test(text) || CHEAP_PHRASES.some((p) => lower.includes(p));
}

/** Calls everything machine. Recall 1.0, precision equal to the class balance. */
function alwaysMachine() { return true; }

/** Coin flip, seeded. The floor any real detector has to clear. */
function coinFlip(seed = 7) {
  const rand = mulberry32(seed);
  return () => rand() > 0.5;
}

/**
 * Score a binary predictor against labelled items.
 * Positive class is `machine`, because a false positive here means telling
 * a person their own writing looks generated, which is the costly error.
 */
function score(items, predict) {
  let tp = 0; let fp = 0; let tn = 0; let fn = 0;
  for (const item of items) {
    const predicted = predict(item.text, item);
    const actual = item.bucket === 'machine';
    if (predicted && actual) tp += 1;
    else if (predicted && !actual) fp += 1;
    else if (!predicted && actual) fn += 1;
    else tn += 1;
  }

  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    tp, fp, tn, fn, precision, recall, f1, accuracy: (tp + tn) / (items.length || 1),
  };
}

/**
 * Bootstrap confidence interval on F1.
 *
 * Not one project in this category reports variance. They publish a point
 * estimate from a single run and call it a benchmark. Resampling the files
 * with replacement costs nothing and shows how much of the number is real.
 */
function bootstrapF1(items, predict, { rounds = 1000, seed = 42 } = {}) {
  const rand = mulberry32(seed);
  const scores = [];

  for (let r = 0; r < rounds; r += 1) {
    const sample = [];
    for (let i = 0; i < items.length; i += 1) {
      sample.push(items[Math.floor(rand() * items.length)]);
    }
    scores.push(score(sample, predict).f1);
  }

  scores.sort((a, b) => a - b);
  return {
    low: scores[Math.floor(rounds * 0.025)],
    high: scores[Math.floor(rounds * 0.975)],
  };
}

module.exports = {
  emDashOnly, cheapPhraseGrep, alwaysMachine, coinFlip, score, bootstrapF1, mulberry32,
};
