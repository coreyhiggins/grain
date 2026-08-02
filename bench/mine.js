#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Mining the trigger vocabulary, second attempt.
//
//   node bench/mine.js <corpus.json> [more.json ...]
//
// The first attempt failed for a reason worth keeping written down: 168
// training prompts produced "day" and "have" as the best signals for a label
// with 21 examples. That is not a bad algorithm, it is not enough data. This
// runs against a corpus roughly ten times larger.
//
// THE DISCIPLINE.
//
// Vocabulary is mined from a training split and scored on a holdout the miner
// never sees. Mining and reporting on the same prompts is fitting the test set
// and produces a number that reproduces nowhere else.
//
// A word earns its place on two measures at once. It has to appear often
// enough to matter, and be lopsided enough to mean something. "the" is
// frequent and says nothing; "changelog" is rare and says everything.

const MIN_DOCS = 8; // appear in at least this many training prompts
const MIN_RATIO = 2.0; // this many times likelier inside the label than outside
const STRONG_RATIO = 5; // above this, treat as a strong signal
const MAX_PER_LABEL = 220;
const SPLIT_SEED = 20260802;

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while',
  'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'into', 'about',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did',
  'this', 'that', 'these', 'those', 'it', 'its', 'as', 'not', 'no', 'any',
  'can', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'have',
  'has', 'had', 'you', 'your', 'i', 'me', 'my', 'we', 'our', 'they', 'them',
  'their', 'he', 'she', 'his', 'her', 'so', 'just', 'like', 'get', 'got',
  'im', 'ive', 'id', 'youre', 'its', 'thats', 'whats', 'dont', 'doesnt',
  'cant', 'wont', 'didnt', 'isnt', 'arent', 'wasnt', 'theres', 'heres',
  'there', 'here', 'what', 'which', 'who', 'how', 'why', 'where', 'when',
  'now', 'still', 'again', 'also', 'too', 'very', 'really', 'much', 'more',
  'most', 'less', 'than', 'over', 'out', 'up', 'down', 'off', 'back', 'after',
  'before', 'some', 'one', 'two', 'all', 'both', 'each', 'every', 'other',
  'thing', 'things', 'stuff', 'way', 'bit', 'lot', 'anything', 'something',
  'nothing', 'someone', 'anyone', 'everyone', 'please', 'thanks', 'ok', 'okay',
  'yes', 'yeah', 'yep', 'nope', 'sure', 'let', 'lets', 'want', 'need', 'try',
  'use', 'used', 'using', 'make', 'made', 'take', 'put', 'go', 'going', 'know',
  'think', 'see', 'look', 'looks', 'seems', 'feel', 'feels', 'good', 'bad',
  'better', 'best', 'fine', 'new', 'old', 'first', 'last', 'next', 'same',
]);

const words = (text) => (String(text).toLowerCase().match(/[a-z][a-z0-9'-]{1,}/g) || [])
  .map((w) => w.replace(/'/g, ''))
  .filter((w) => w.length > 2 && !STOP.has(w));

/** Deterministic split, so the reported number reproduces anywhere. */
function split(items, seed = SPLIT_SEED) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = [...items].sort((x, y) => String(x.id).localeCompare(String(y.id)));
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const cut = Math.floor(shuffled.length * 0.65);
  return { train: shuffled.slice(0, cut), holdout: shuffled.slice(cut) };
}

/** Normalise both corpus shapes into `{ id, text, labels[] }`. */
function load(files) {
  const items = [];
  for (const file of files) {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) {
      console.error(`cannot read ${file}: ${err.message}`);
      process.exit(1);
    }
    const list = Array.isArray(raw) ? raw : raw.files || raw.prompts || [];
    for (const entry of list) {
      const labels = Array.isArray(entry.labels)
        ? entry.labels
        : (entry.label && entry.label !== 'none' ? [entry.label] : []);
      if (typeof entry.text !== 'string') continue;
      items.push({ id: String(entry.id || items.length), text: entry.text, labels, context: entry.context });
    }
  }
  return items;
}

function mine(train, label) {
  const inside = train.filter((t) => t.labels.includes(label));
  const outside = train.filter((t) => !t.labels.includes(label));
  if (inside.length < 20) return { strong: [], weak: [], sampled: inside.length };

  const count = (set) => {
    const c = new Map();
    for (const item of set) for (const w of new Set(words(item.text))) c.set(w, (c.get(w) || 0) + 1);
    return c;
  };

  const ci = count(inside);
  const co = count(outside);
  const scored = [];

  for (const [w, n] of ci) {
    if (n < MIN_DOCS) continue;
    const pIn = n / inside.length;
    // Laplace smoothing, so a word absent outside does not divide by zero and
    // rank above everything on a single occurrence.
    const pOut = ((co.get(w) || 0) + 0.5) / (outside.length + 0.5);
    const ratio = pIn / pOut;
    if (ratio < MIN_RATIO) continue;
    scored.push({ w, ratio, n });
  }

  // Rank by discrimination weighted by how often the word actually shows up.
  scored.sort((x, y) => y.ratio * Math.log(1 + y.n) - x.ratio * Math.log(1 + x.n));
  const kept = scored.slice(0, MAX_PER_LABEL);

  return {
    strong: kept.filter((k) => k.ratio >= STRONG_RATIO).map((k) => k.w),
    weak: kept.filter((k) => k.ratio < STRONG_RATIO).map((k) => k.w),
    sampled: inside.length,
    top: kept.slice(0, 12).map((k) => `${k.w}(${k.ratio.toFixed(1)}x,${k.n})`),
  };
}

/**
 * Score the mined vocabulary on the holdout, in isolation.
 *
 * This deliberately does not run the real router. It answers a narrower
 * question: does this vocabulary separate the labels at all? If it does not,
 * there is no point wiring it in, and if it does, the real benchmark is the
 * next step rather than this one.
 */
function evaluate(holdout, vocab, labels) {
  let right = 0;
  let silent = 0;
  let wrong = 0;
  let quietOk = 0;
  let shouldSpeak = 0;
  let shouldBeQuiet = 0;

  for (const item of holdout) {
    const text = ` ${item.text.toLowerCase()} `;
    const scores = {};
    for (const label of labels) {
      const v = vocab[label];
      if (!v) continue;
      let s = 0;
      for (const w of v.strong) if (text.includes(` ${w} `)) s += 3;
      for (const w of v.weak) if (text.includes(` ${w} `)) s += 1;
      scores[label] = s;
    }
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topLabel, topScore] = ranked[0] || [null, 0];
    const got = topScore >= 3 ? topLabel : null;

    if (!item.labels.length) {
      shouldBeQuiet += 1;
      if (!got) quietOk += 1;
      continue;
    }
    shouldSpeak += 1;
    if (!got) silent += 1;
    else if (item.labels.includes(got)) right += 1;
    else wrong += 1;
  }

  return {
    right: right / (shouldSpeak || 1),
    silent: silent / (shouldSpeak || 1),
    wrong: wrong / (shouldSpeak || 1),
    quiet: quietOk / (shouldBeQuiet || 1),
    shouldSpeak,
    shouldBeQuiet,
  };
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('usage: node bench/mine.js <corpus.json> [more.json ...]');
    process.exit(1);
  }

  const items = load(files);
  const { train, holdout } = split(items);
  const labels = [...new Set(items.flatMap((i) => i.labels))].sort();

  console.log('\ngrain vocabulary mining');
  console.log('='.repeat(70));
  console.log(`\n  ${items.length} prompts from ${files.length} file(s)`);
  console.log(`  ${train.length} train, ${holdout.length} holdout (holdout never mined)`);
  console.log(`  ${items.filter((i) => !i.labels.length).length} labelled as wanting nothing\n`);

  const vocab = {};
  for (const label of labels) {
    const v = mine(train, label);
    vocab[label] = v;
    console.log(`  ${label}  ${v.sampled} training examples, ${v.strong.length} strong + ${v.weak.length} weak`);
    if (v.top) console.log(`    ${v.top.join('  ')}`);
    console.log('');
  }

  const scored = evaluate(holdout, vocab, labels);
  const pct = (n) => `${(n * 100).toFixed(0)}%`;
  console.log('  mined vocabulary on the holdout, scored in isolation');
  console.log(`    serves the right label   ${pct(scored.right)}`);
  console.log(`    stays silent             ${pct(scored.silent)}`);
  console.log(`    wrong label              ${pct(scored.wrong)}`);
  console.log(`    correctly quiet          ${pct(scored.quiet)}`);

  const out = path.join(__dirname, 'mined-vocab.json');
  fs.writeFileSync(out, JSON.stringify(vocab, null, 1));
  console.log(`\n  written to ${path.relative(process.cwd(), out)}`);
  console.log('  This is the vocabulary in isolation, not the shipped router.');
  console.log('  Wiring it in is a separate step, measured separately.\n');
}

if (require.main === module) main();

module.exports = { mine, split, load, evaluate, words };
