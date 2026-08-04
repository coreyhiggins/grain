'use strict';

// The detectors.
//
// Every one of these has to be COUNTABLE. That is the whole reason this
// project can exist in a category where nothing else can prove anything: an
// em dash is either present or it is not, paragraph lengths either vary or
// they do not. No detector here returns a feeling.
//
// A rule earns its place only if a human, shown the finding, can look at the
// line and agree or disagree. If the only defence of a finding is "it reads
// like a machine", it does not belong in this file.

const { sentences, paragraphs, words, isProse } = require('./text');

/** Coefficient of variation. 0 means every value identical. */
function variation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!mean) return null;
  const varianceSum = values.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  return Math.sqrt(varianceSum / values.length) / mean;
}

/**
 * Phrases that are not wrong, but that machine writing reaches for far more
 * often than people do. Presence is not damning; density is.
 */
const STOCK_PHRASES = [
  "it's worth noting", 'it is worth noting', "it's important to", 'it is important to',
  'in conclusion', 'overall,', 'moreover,', 'furthermore,', 'additionally,',
  'delve into', 'leverage the', 'seamless', 'robust solution', 'utilize',
  'a testament to', 'plays a crucial role', 'plays a vital role',
  'in the ever-evolving', 'in today\'s fast-paced', 'navigate the complexities',
  'unlock the potential', 'game-changer', 'best practices for',
  'when it comes to', 'at the end of the day', 'that being said',
];

/** Words whose stacking reads as a model refusing to commit. */
const HEDGES = [
  'might', 'may', 'could', 'perhaps', 'possibly', 'potentially', 'arguably',
  'generally', 'typically', 'often', 'somewhat', 'relatively', 'fairly',
];

const CONTRACTIBLE = [
  [/\bit is\b/gi, "it's"], [/\bthat is\b/gi, "that's"], [/\bdo not\b/gi, "don't"],
  [/\bdoes not\b/gi, "doesn't"], [/\bcannot\b/gi, "can't"], [/\bwill not\b/gi, "won't"],
  [/\bis not\b/gi, "isn't"], [/\bare not\b/gi, "aren't"], [/\byou are\b/gi, "you're"],
  [/\bwe are\b/gi, "we're"], [/\bthey are\b/gi, "they're"], [/\bI am\b/g, "I'm"],
  [/\bhave not\b/gi, "haven't"], [/\bwould not\b/gi, "wouldn't"], [/\blet us\b/gi, "let's"],
];

// Contractions, and the possessives that are not contractions.
//
// This used to be /\b\w+['’](s|t|re|ve|ll|d|m)\b/, which counts "model's",
// "repository's" and "grain's" as contractions because it cannot tell a
// possessive apostrophe from an elided verb. Every one of the eight matches in
// this project's own SECURITY.md was a possessive, and the file was reported as
// 57% contracted against a 14% project baseline: a register shift that did not
// exist, flagged on correct formal writing.
//
// That is the failure mode that gets a style tool switched off within a day,
// so the ambiguous suffix is now restricted. Everything except 's is
// unambiguous: no English possessive ends in 't, 're, 've, 'll, 'd or 'm.
// For 's, only a closed set of words takes it as "is" or "has". Nouns take it
// as a possessive, and nouns are the open class, so listing the exceptions is
// the tractable direction.
const CONTRACTS_WITH_S = 'it|that|there|here|what|who|he|she|let|which|how|why|where|when|one|this|everyone|someone|anyone|nobody|everything|something|nothing';
const CONTRACTION = new RegExp(
  `\\b(?:(?:${CONTRACTS_WITH_S})['’]s|\\w+['’](?:t|re|ve|ll|d|m))\\b`,
  'gi',
);

// ---------------------------------------------------------------- detectors --

/**
 * Em and en dashes. The most widely cited tell, and the one where a straight
 * count is the whole story.
 *
 * It did not survive first contact with a benchmark. On genre-matched
 * technical documentation (2026-08-01) this fired at 0.07 per 1,000 words on
 * human text and 0.00 on Claude Opus 5, which is backwards. Two caveats keep
 * it in the file for now: the corpus was thirty files, and every machine
 * sample came from an environment whose house rules forbid em dashes, so the
 * zero may be the rule rather than the model.
 *
 * Kept, not defended. If a clean corpus reproduces the inversion, cut it.
 */
function dashes(text, lines) {
  const out = [];
  lines.forEach((line, i) => {
    if (!isProse(line)) return;
    const m = line.match(/[—–]/g);
    if (m) {
      out.push({
        rule: 'dash',
        line: i + 1,
        count: m.length,
        detail: `${m.length} em or en dash${m.length > 1 ? 'es' : ''}`,
        why: 'The most widely cited marker of machine-written prose, though it did not separate the two on grain\'s first benchmark corpus. A comma, a colon, or two sentences almost always reads better anyway.',
      });
    }
  });
  return out;
}

/**
 * Contractions used inconsistently WITHIN one piece of text.
 *
 * This is the subtle one, and it is the tell that gave away a cover letter
 * during development: it opened with "I'm applying" and then used "That is",
 * "I have", and "does not" for the rest. People are consistent without
 * trying. A model drifts toward formality mid-paragraph.
 */
function contractionRate(text) {
  const contracted = (text.match(CONTRACTION) || []).length;
  let expandable = 0;
  for (const [pattern] of CONTRACTIBLE) expandable += (text.match(pattern) || []).length;
  const total = contracted + expandable;
  return { contracted, expandable, total, rate: total ? contracted / total : null };
}

function contractionDrift(text) {
  // The first version of this measured the overall RATE and flagged anything
  // in the middle. Running it over three vaults of real human writing showed
  // those authors sit at 74%, 61%, and 55%, so the rule was flagging normal
  // prose. The name was right and the implementation was wrong.
  //
  // Drift is a change ACROSS a text: opening casual and closing formal, which
  // is what a model does when it slides toward register mid-piece. A steady
  // 60% is a voice. Going from 90% to 20% is drift.
  const half = Math.floor(text.length / 2);
  const first = contractionRate(text.slice(0, half));
  const second = contractionRate(text.slice(half));

  // Each half needs enough opportunities for its rate to mean anything.
  if (first.total < 5 || second.total < 5) return [];
  if (first.rate === null || second.rate === null) return [];

  const gap = Math.abs(first.rate - second.rate);
  if (gap < 0.5) return [];

  return [{
    rule: 'contraction-drift',
    line: null,
    count: first.total + second.total,
    detail: `${Math.round(first.rate * 100)}% contracted in the first half, ${Math.round(second.rate * 100)}% in the second`,
    why: 'The register shifts partway through. A steady level of contraction is a voice; changing mid-piece is what a model does as it slides toward formality. Pick one and hold it.',
  }];
}

/**
 * Paragraphs of near-identical length. Human writing is lopsided: a
 * one-line paragraph next to a six-line one. Uniform blocks look generated
 * before anyone reads a word.
 */
function uniformParagraphs(text) {
  const paras = paragraphs(text).filter((p) => isProse(p) && words(p).length > 12);
  if (paras.length < 4) return [];

  const lengths = paras.map((p) => words(p).length);
  const cv = variation(lengths);
  if (cv === null || cv > 0.28) return [];

  return [{
    rule: 'uniform-paragraphs',
    line: null,
    count: paras.length,
    detail: `${paras.length} paragraphs, lengths ${lengths.join('/')} words (variation ${cv.toFixed(2)})`,
    why: 'Almost identical lengths. Human writing is uneven, because some points need three words and some need thirty. Break one up or let one run.',
  }];
}

/** The same, one level down: sentences all cut to the same length. */
function uniformSentences(text) {
  const sents = sentences(text).filter((s) => words(s).length > 3);
  if (sents.length < 6) return [];

  const lengths = sents.map((s) => words(s).length);
  const cv = variation(lengths);
  if (cv === null || cv > 0.32) return [];

  return [{
    rule: 'uniform-sentences',
    line: null,
    count: sents.length,
    detail: `${sents.length} sentences averaging ${Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)} words (variation ${cv.toFixed(2)})`,
    why: 'Every sentence about the same length. Rhythm is what makes prose sound like a person. A four-word sentence next to a long one does more than any word choice.',
  }];
}

/**
 * Setup, colon, payoff.
 *
 * This is a real tell, but it is a DENSITY tell, not a per-line one. Good
 * writers use colons. Using this exact shape four times in a page is the
 * signal; using it once is just punctuation. Reported as one finding for the
 * whole text, which is why the threshold sits at three.
 *
 * Learned by running an earlier version over prose written by hand and
 * watching it flag a sentence that was perfectly good.
 */
function colonPayoff(text, lines) {
  const hits = [];
  lines.forEach((line, i) => {
    if (!isProse(line)) return;
    const m = line.match(/^(?!\s*[-*>#|])(?!.*https?:)(.{25,}?)\s?:\s+([a-z].{20,})$/);
    if (m && !/^\s*\w+\s*:/.test(line)) hits.push(i + 1);
  });

  if (hits.length < 3) return [];

  return [{
    rule: 'colon-payoff',
    line: hits[0],
    count: hits.length,
    detail: `${hits.length} setup-colon-payoff sentences (lines ${hits.slice(0, 6).join(', ')})`,
    why: 'Used once this is just a colon. Used repeatedly it becomes a rhythm, and setup-colon-payoff is the most recognizable generated sentence shape. Turn a few into two sentences.',
  }];
}

// The tricolon detector was cut here.
//
// It flagged "Works with Claude Code, Cursor, and Codex CLI" and a five-item
// list of technologies as rhetorical rule-of-three. Three of its first four
// findings on real prose were wrong.
//
// The distinction that matters is factual list versus rhetorical flourish,
// and nothing available at the string level can make it. A detector that is
// wrong most of the time is worse than a missing one: it teaches people to
// dismiss the output, and then the accurate findings go unread too. If this
// comes back it needs to be able to tell those apart, not just match commas.

/**
 * Remove quoted and backticked spans.
 *
 * The use-mention distinction, and it is not academic here. grain's own
 * README lists the phrases it detects, and the first version flagged its own
 * documentation for naming them. So does every style guide, every
 * CONTRIBUTING file, and every code review that says "cut the 'furthermore'".
 * A phrase inside quotes is being talked about, not used.
 *
 * Only double quotes and backticks are stripped. Single quotes are left alone
 * because apostrophes would take contractions with them, and "it's worth
 * noting" is a phrase we need to keep matching.
 */
function stripQuoted(line) {
  return line
    .replace(/`[^`]*`/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/“[^”]*”/g, ' ');
}

/**
 * Stock phrases, counted. One is nothing. Four is a fingerprint.
 *
 * Grouped by line, because the first version emitted one finding per phrase
 * and a single dense paragraph produced five identical explanations stacked
 * on top of each other. Repeating the same sentence five times is how a tool
 * teaches people to scroll past its output.
 */
function stockPhrases(text, lines) {
  const out = [];
  lines.forEach((line, i) => {
    if (!isProse(line)) return;
    const lower = stripQuoted(line).toLowerCase();
    const found = STOCK_PHRASES.filter((p) => lower.includes(p));
    if (!found.length) return;

    out.push({
      rule: 'stock-phrase',
      line: i + 1,
      count: found.length,
      detail: found.map((p) => `"${p.trim().replace(/,$/, '')}"`).join(', '),
      why: 'Filler that models reach for far more than people do. Cutting it almost never loses meaning.',
    });
  });
  return out;
}

/** Stacked hedges. One hedge is honest. Three in a sentence is noise. */
function hedgeStack(text, lines) {
  const out = [];
  lines.forEach((line, i) => {
    if (!isProse(line)) return;
    for (const s of sentences(line)) {
      const w = words(s).map((x) => x.toLowerCase());
      if (w.length < 6) continue;
      const found = w.filter((x) => HEDGES.includes(x));
      if (found.length >= 3) {
        out.push({
          rule: 'hedge-stack',
          line: i + 1,
          count: found.length,
          detail: found.join(', '),
          why: 'Several hedges in one sentence. Hedging once is honest; stacking reads as refusing to commit. Say the thing, or say you are unsure once.',
        });
      }
    }
  });
  return out;
}

const DETECTORS = [
  dashes, colonPayoff, stockPhrases, hedgeStack,
  contractionDrift, uniformParagraphs, uniformSentences,
];

/** Run everything. Returns findings sorted by line, nulls last. */
function detect(text) {
  const lines = text.split(/\r?\n/);
  const findings = [];
  for (const d of DETECTORS) findings.push(...d(text, lines));
  return findings.sort((a, b) => (a.line ?? 1e9) - (b.line ?? 1e9));
}

module.exports = {
  detect, variation, STOCK_PHRASES, HEDGES, CONTRACTIBLE, CONTRACTION,
  dashes, contractionDrift, uniformParagraphs, uniformSentences,
  colonPayoff, stockPhrases, hedgeStack, stripQuoted,
};
