#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Mining the trigger vocabulary from labelled prompts.
//
//   node bench/mine-vocab.js [corpus.json]
//
// The first trigger lists were written from intuition about which words show
// up in which kind of request. Measured against 280 real prompts, that
// intuition covered 19 percent of them. People do not type "refactor"; they
// type "pull the duplicated date formatting out of the 4 places it lives".
//
// So the lists get mined instead. For each label, find the words that appear
// disproportionately in prompts carrying it, rank by how strongly they
// discriminate, and keep the top few.
//
// THE DISCIPLINE THAT MAKES THIS HONEST.
//
// Mining vocabulary from the same prompts used to report the score is fitting
// the test set, and it would produce a number that reproduces nowhere else.
// So the corpus is split with a fixed seed, words are mined from the training
// half ONLY, and the score is reported on a holdout the miner never saw.
//
// A word earns a place by two measures at once: it has to be frequent enough
// to matter, and lopsided enough to mean something. "the" is frequent and
// tells you nothing. "changelog" is rare and tells you everything.

const MIN_DOCS = 3; // appear in at least this many training prompts
const MIN_RATIO = 2.5; // this many times more likely inside the label than outside
const STRONG_RATIO = 6; // above this, treat as a strong signal
const MAX_PER_LABEL = 70;

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while', 'for',
  'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'into', 'about', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'doing', 'this', 'that',
  'these', 'those', 'it', 'its', 'as', 'not', 'no', 'any', 'can', 'will', 'would',
  'should', 'could', 'may', 'might', 'must', 'you', 'your', 'i', 'me', 'my', 'we',
  'our', 'they', 'them', 'their', 'he', 'she', 'his', 'her', 'so', 'just', 'like',
  'get', 'got', 'make', 'made', 'new', 'all', 'some', 'one', 'two', 'now', 'here',
  'there', 'what', 'which', 'who', 'how', 'why', 'where', 'whats', 'dont', 'doesnt',
  'cant', 'wont', 'im', 'ive', 'thats', 'its', 'lets', 'let', 'please', 'thanks',
  'ok', 'okay', 'yes', 'yeah', 'nope', 'sure', 'still', 'again', 'also', 'too',
  'very', 'really', 'much', 'more', 'most', 'less', 'than', 'over', 'out', 'up',
  'down', 'off', 'back', 'after', 'before', 'first', 'last', 'next', 'other',
  'need', 'want', 'try', 'use', 'used', 'using', 'take', 'put', 'go', 'going',
  'know', 'think', 'see', 'look', 'looks', 'seems', 'feel', 'feels', 'thing',
  'things', 'stuff', 'way', 'bit', 'lot', 'good', 'bad', 'better', 'best', 'fine',
]);

const words = (text) => (String(text).toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [])
  .map((w) => w.replace(/'/g, ''))
  .filter((w) => w.length > 2 && !STOP.has(w));

/** Deterministic split so the reported number reproduces on any machine. */
function split(items, seed = 20260802) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = [...items].sort((x, y) => x.id.localeCompare(y.id));
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const cut = Math.floor(shuffled.length * 0.6);
  return { train: shuffled.slice(0, cut), holdout: shuffled.slice(cut) };
}

function mine(train, label) {
  const inside = train.filter((t) => t.labels.includes(label));
  const outside = train.filter((t) => !t.labels.includes(label));
  if (inside.length < 5) return { strong: [], weak: [] };

  const count = (set) => {
    const c = new Map();
    for (const item of set) {
      for (const w of new Set(words(item.text))) c.set(w, (c.get(w) || 0) + 1);
    }
    return c;
  };

  const ci = count(inside);
  const co = count(outside);
  const scored = [];

  for (const [w, n] of ci) {
    if (n < MIN_DOCS) continue;
    const pIn = n / inside.length;
    // Laplace smoothing, so a word absent from the outside set does not divide
    // by zero and rank above everything on a single occurrence.
    const pOut = ((co.get(w) || 0) + 0.5) / (outside.length + 0.5);
    const ratio = pIn / pOut;
    if (ratio < MIN_RATIO) continue;
    scored.push({ w, ratio, n });
  }

  scored.sort((x, y) => y.ratio * Math.log(1 + y.n) - x.ratio * Math.log(1 + x.n));
  const kept = scored.slice(0, MAX_PER_LABEL);
  return {
    strong: kept.filter((k) => k.ratio >= STRONG_RATIO).map((k) => k.w),
    weak: kept.filter((k) => k.ratio < STRONG_RATIO).map((k) => k.w),
  };
}

function main() {
  const file = process.argv[2] || path.join(__dirname, 'routing-corpus.json');
  const corpus = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { train, holdout } = split(corpus);

  console.log(`\n  ${corpus.length} prompts: ${train.length} train, ${holdout.length} holdout`);
  console.log('  Vocabulary is mined from the training half only.\n');

  const out = {};
  for (const label of ['engineering', 'prose', 'design', 'orchestration']) {
    const v = mine(train, label);
    out[label] = v;
    console.log(`  ${label}: ${v.strong.length} strong, ${v.weak.length} weak`);
    console.log(`    strong: ${v.strong.slice(0, 14).join(', ')}`);
    console.log(`    weak:   ${v.weak.slice(0, 14).join(', ')}\n`);
  }

  const dest = path.join(__dirname, 'mined-vocab.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(`  written to ${path.relative(process.cwd(), dest)}`);
  console.log('  Holdout ids are in the split above and were not consulted.\n');
}

if (require.main === module) main();

module.exports = { mine, split, words };
