'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  words, sentences, paragraphs, stripNonProse, isProse,
} = require('./text');
const { variation, CONTRACTION, CONTRACTIBLE, STOCK_PHRASES } = require('./tells');

// Learning a project's voice from its own prose.
//
// This is the part that separates a style linter from a scold. A fixed
// ruleset tells everyone to write the same way. A profile says: this repo
// has never used an em dash in 40 files, so the one on line 14 stands out
// HERE, whatever the general rule might be.
//
// Two things this must not do:
//   1. Learn from generated text. If half the repo was written by a model,
//      the profile inherits its habits and the linter goes quiet. The
//      `confidence` field exists so callers can say so out loud.
//   2. Pretend to know things it does not. Every field can be null, and a
//      null field means "no opinion", not "zero".

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', 'vendor',
  '.next', 'target', '__pycache__', '.venv', 'venv', 'assets',
]);

const PROSE_EXT = new Set(['.md', '.markdown', '.mdx', '.txt', '.rst']);
const MAX_FILES = 200;
const MAX_BYTES = 512 * 1024;

/** Markdown and text files in the repo, capped. */
function proseFiles(root) {
  const found = [];
  const visit = (dir, depth) => {
    if (found.length >= MAX_FILES || depth > 6) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (found.length >= MAX_FILES) return;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        visit(path.join(dir, e.name), depth + 1);
        continue;
      }
      if (PROSE_EXT.has(path.extname(e.name).toLowerCase())) found.push(path.join(dir, e.name));
    }
  };
  visit(path.resolve(root), 0);
  return found;
}

/** Commit message bodies, which are the purest sample of how someone writes. */
function commitBodies(root, limit = 200) {
  try {
    const raw = execFileSync('git', ['log', `-${limit}`, '--format=%s%n%b%n<<GRAIN>>'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    });
    return raw.split('<<GRAIN>>').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Measure one corpus of text into raw counts. */
function measure(texts) {
  const acc = {
    files: texts.length,
    words: 0,
    dashes: 0,
    contracted: 0,
    expandable: 0,
    stock: 0,
    sentenceLengths: [],
    paragraphLengths: [],
    commitSubjects: [],
    commitBodyLines: [],
  };

  for (const text of texts) {
    const prose = stripNonProse(text);
    acc.words += words(prose).length;
    acc.dashes += (prose.match(/[—–]/g) || []).length;
    acc.contracted += (prose.match(CONTRACTION) || []).length;
    for (const [pattern] of CONTRACTIBLE) acc.expandable += (prose.match(pattern) || []).length;

    const lower = prose.toLowerCase();
    for (const phrase of STOCK_PHRASES) {
      if (lower.includes(phrase)) acc.stock += 1;
    }

    for (const s of sentences(prose)) {
      const n = words(s).length;
      if (n > 2) acc.sentenceLengths.push(n);
    }
    for (const p of paragraphs(prose)) {
      const n = words(p).length;
      if (n > 12) acc.paragraphLengths.push(n);
    }
  }

  return acc;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Build a voice profile for a repository.
 *
 * `confidence` is deliberately conservative. Below a few thousand words of
 * prose, a profile is an anecdote, and callers should say so rather than
 * quietly presenting inference as fact.
 */
function buildProfile(root = process.cwd()) {
  const files = proseFiles(root);
  const texts = [];

  for (const f of files) {
    try {
      if (fs.statSync(f).size > MAX_BYTES) continue;
      texts.push(fs.readFileSync(f, 'utf8'));
    } catch { /* unreadable is not fatal */ }
  }

  const m = measure(texts);
  const commits = commitBodies(root);

  const subjects = [];
  const bodyLines = [];
  for (const c of commits) {
    const lines = c.split('\n');
    if (lines[0]) subjects.push(lines[0].length);
    bodyLines.push(lines.slice(1).filter((l) => l.trim()).length);
  }

  const contractionTotal = m.contracted + m.expandable;

  const profile = {
    root: path.resolve(root),
    files: files.length,
    words: m.words,

    // Per 10,000 words, so short and long corpora compare.
    dashRate: m.words ? (m.dashes / m.words) * 10000 : null,
    dashCount: m.dashes,

    contractionRate: contractionTotal >= 20 ? m.contracted / contractionTotal : null,
    stockPhraseRate: m.words ? (m.stock / m.words) * 10000 : null,

    sentenceMean: mean(m.sentenceLengths),
    sentenceVariation: variation(m.sentenceLengths),
    paragraphMean: mean(m.paragraphLengths),
    paragraphVariation: variation(m.paragraphLengths),

    commitSubjectMean: mean(subjects),
    commitBodyLineMean: mean(bodyLines),
    commits: commits.length,

    confidence: null,
  };

  profile.confidence = m.words >= 5000 ? 'good'
    : m.words >= 1200 ? 'thin'
      : 'insufficient';

  return profile;
}

/**
 * Compare a text against a learned profile. These findings are about fitting
 * in, not about being good, and they are reported separately from the
 * universal tells for exactly that reason.
 */
function compareToProfile(text, profile) {
  const out = [];
  if (!profile || profile.confidence === 'insufficient') return out;

  const prose = stripNonProse(text);
  const n = words(prose).length;
  if (n < 40) return out;

  // The house-style case. If a repo has never used an em dash across
  // thousands of words, one here is a departure regardless of taste.
  const dashes = (prose.match(/[—–]/g) || []).length;
  if (dashes > 0 && profile.dashCount === 0 && profile.words > 2000) {
    out.push({
      rule: 'house-dash',
      line: null,
      count: dashes,
      detail: `${dashes} here, none in ${profile.words.toLocaleString()} words of existing prose`,
      why: 'This project has never used them. Whatever the general argument, here it is a departure from an established convention.',
    });
  }

  if (profile.contractionRate !== null) {
    const contracted = (prose.match(CONTRACTION) || []).length;
    let expandable = 0;
    for (const [pattern] of CONTRACTIBLE) expandable += (prose.match(pattern) || []).length;
    const total = contracted + expandable;

    if (total >= 8) {
      const rate = contracted / total;
      if (Math.abs(rate - profile.contractionRate) > 0.4) {
        out.push({
          rule: 'house-register',
          line: null,
          count: total,
          detail: `${Math.round(rate * 100)}% contracted here, ${Math.round(profile.contractionRate * 100)}% across the project`,
          why: rate > profile.contractionRate
            ? 'Noticeably more casual than the rest of this project.'
            : 'Noticeably more formal than the rest of this project.',
        });
      }
    }
  }

  // Comparing a mean against a mean ignores how much the project already
  // varies. Three real vaults measured sentence variation above 1.0, meaning
  // the spread exceeds the average, so a flat percentage threshold fired on
  // 14 to 30 percent of files that were written perfectly normally.
  //
  // Judge the distance in units of the project's OWN spread instead. A repo
  // that writes uniformly gets a tight band; a repo that already swings
  // between one-liners and long paragraphs gets a wide one, which is correct.
  if (profile.sentenceMean && profile.sentenceVariation) {
    const lengths = sentences(prose).map((s) => words(s).length).filter((x) => x > 2);
    if (lengths.length >= 8) {
      const here = mean(lengths);
      const spread = profile.sentenceMean * profile.sentenceVariation;
      const z = spread ? Math.abs(here - profile.sentenceMean) / spread : 0;

      if (z > 1.5) {
        out.push({
          rule: 'house-sentence-length',
          line: null,
          count: Math.round(here),
          detail: `${Math.round(here)} words per sentence here, ${Math.round(profile.sentenceMean)} across the project`,
          why: here > profile.sentenceMean
            ? 'Noticeably longer sentences than this project writes, even allowing for how much it already varies.'
            : 'Noticeably shorter sentences than this project writes, even allowing for how much it already varies.',
        });
      }
    }
  }

  return out;
}

module.exports = { buildProfile, compareToProfile, proseFiles, commitBodies, measure };
