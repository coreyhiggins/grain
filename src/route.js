'use strict';

const { fromPaths } = require('./paths');

// Reading what you actually asked for.
//
// This is the front door. UserPromptSubmit fires on EVERY prompt, so whatever
// happens here happens hundreds of times a day, and the cost of getting it
// wrong compounds in two directions at once.
//
// THE COST THAT KILLED THE COMPETITION.
//
// caveman injects its rules block unconditionally, every single turn. A user
// measured that at roughly 800 to 1,200 input tokens per turn, plus another
// 300 for skill entries, and concluded that on short exchanges it costs more
// than it saves. The maintainers agreed in their own honest-numbers doc: on
// already-terse workloads it can go net negative.
//
// That is not a tuning problem, it is an architecture problem. A tool that
// pays a fixed tax on every turn has to earn that tax back on every turn.
//
// So grain routes instead. Classify the request, inject only the guidance
// that matches, and when the signal is weak inject NOTHING AT ALL. A
// conversational turn should cost exactly zero extra tokens.
//
// Everything here is string matching. No model call, no network, no latency
// worth measuring, and every decision is inspectable and testable.

/**
 * Signals are weighted because they are not equally diagnostic. "refactor"
 * means one thing. "update" appears in every kind of request there is.
 */
// The vocabulary below was expanded from the prompts a benchmark showed the
// original lists missing. That original set was written from intuition about
// which words appear in which request, and it served 19 percent of 280 real
// prompts. People do not type "refactor". They type "pull the duplicated date
// formatting out of the 4 places it lives".
//
// Only the training half of the corpus was read while writing these. The
// holdout was scored afterwards and never consulted during the expansion,
// because a vocabulary tuned against the test set reports a number that
// reproduces nowhere else.
const MODES = {
  engineering: {
    strong: [
      'refactor', 'implement', 'debug', 'stack trace', 'traceback', 'null pointer',
      'race condition', 'memory leak', 'regression', 'unit test', 'integration test',
      'pull request', 'merge conflict', 'endpoint', 'middleware', 'migration',
      'compile', 'compiling', 'build error', 'type error', 'linter', 'segfault',
      'deadlock', 'dedupe', 'deduplicate', 'feature flag', 'query planner',
      'pagination', 'cursor based', 'index', 'indexes', 'indices', 'lint',
      'rollback', 'rollbacks', 'timeout', 'timeouts', 'race', 'flaky',
      'exception', 'undefined', 'null', 'nan', 'leak', 'crash', 'crashing',
      'importing', 'imports', 'dependency', 'dependencies', 'upgrade', 'downgrade',
      'rate limiting', 'idempotent', 'backoff', 'retry', 'retries', 'connection pool',
      'transaction', 'rollout', 'revert', 'rebase', 'cherry pick', 'stack overflow',
    ],
    weak: [
      'function', 'class', 'method', 'variable', 'component', 'module', 'api',
      'bug', 'error', 'errors', 'fails', 'failing', 'broken', 'breaks', 'test',
      'tests', 'testing', 'script', 'handler', 'service', 'database', 'query',
      'queries', 'schema', 'cache', 'caching', 'parser', 'fix', 'fixes', 'add',
      'build', 'wire', 'hook up', 'integrate', 'optimize', 'rename', 'extract',
      'inline', 'patch', 'deploy', 'commit', 'commits', 'branch', 'branches',
      'server', 'client', 'request', 'response', 'payload', 'json', 'sql',
      'table', 'column', 'row', 'rows', 'auth', 'token', 'session', 'cookie',
      'thread', 'async', 'await', 'promise', 'callback', 'loop', 'array',
      'duplicated', 'duplicate', 'unused', 'dead code', 'clean up', 'delete',
      'remove', 'strip', 'pull out', 'split', 'merge', 'validate', 'parse',
      'slow', 'performance', 'memory', 'cpu', 'latency', 'production', 'prod',
      'staging', 'local', 'locally', 'browser', 'browsers', 'version', 'package',
    ],
  },

  prose: {
    strong: [
      'readme', 'changelog', 'release notes', 'commit message', 'commit messages',
      'blog post', 'documentation', 'docs for', 'announcement', 'cover letter',
      'press release', 'newsletter', 'article', 'write up', 'writeup', 'user guide',
      'tutorial for', 'contributing guide', 'migration guide', 'api reference',
      'onboarding email', 'error copy', 'microcopy', 'tone it down', 'sales-y',
      'salesy', 'jargon', 'proofread', 'reword', 'rephrase', 'postmortem',
      'incident report', 'adr', 'faq', 'changelog entry', 'docstring', 'jsdoc',
    ],
    weak: [
      'write', 'writing', 'draft', 'rewrite', 'edit', 'wording', 'worded',
      'copy', 'email', 'message', 'post', 'summary', 'summarize', 'explain to',
      'tone', 'phrasing', 'paragraph', 'headline', 'tagline', 'comment',
      'comments', 'document', 'documenting', 'note', 'notes', 'guide', 'doc',
      'docs', 'readable', 'clearer', 'concise', 'polite', 'friendly',
      'intimidating', 'sentence', 'sentences', 'wordy', 'blurb', 'caption',
      'label', 'labels', 'text for', 'says', 'wording of', 'apologize',
    ],
  },

  orchestration: {
    strong: [
      'orchestrate', 'delegate', 'sub-agent', 'subagent', 'subagents', 'fan out',
      'break this down', 'break it down', 'break down', 'decompose', 'write a spec',
      'spec out', 'tech spec', 'project plan', 'roadmap', 'milestones', 'in parallel',
      'parallelize', 'kick off agents', 'spin up an agent', 'dispatch',
      'work breakdown', 'rollout plan', 'kill switch', 'story points', 'gets cut',
      'what should i do first', 'sequence the work', 'blocked on', 'map out',
      'over engineer', 'overengineer', 'ship friday', 'monorepo', 'trade off',
      'tradeoff', 'tradeoffs', 'alternatives', 'we rejected', 'do first',
    ],
    weak: [
      'plan', 'planning', 'phases', 'phase', 'sequence', 'coordinate', 'scope',
      'brief', 'briefs', 'estimate', 'estimating', 'timeline', 'approach',
      'strategy', 'assign', 'workers', 'or just', 'or should we', 'should we',
      'ourselves', 'weeks', 'week', 'days', 'sprint', 'quarter', 'priorit',
      'first', 'later', 'order', 'ordering', 'decide', 'decision', 'choose',
      'versus', 'vs', 'options', 'option', 'team', 'people', 'own', 'owns',
      'ownership', 'proposal', 'rfc', 'risk', 'risks', 'depends on', 'before we',
    ],
  },

  // Added after two independent labellers, working blind, both reported the
  // same hole: prompts challenging the assistant's account of its own work fit
  // none of the other four. These are short by nature, which is why the
  // length gate has an exception for them below.
  verification: {
    strong: [
      'did you actually', 'did you really', 'are you guessing', 'are you sure',
      'did you run', 'did you test', 'did you verify', 'did you check',
      'how do you know', 'prove it', 'show me the output', 'show your work',
      'which file did you change', 'what did you change', 'what did that do',
      'did that work', 'is that true', 'or are you assuming', 'source for that',
      'have you verified', 'can you confirm', 'double check', 'double-check',
      'you sure about', 'did it pass', 'did the tests pass',
    ],
    weak: [
      'guessing', 'guess', 'assuming', 'assumed', 'verify', 'verified',
      'confirm', 'certain', 'evidence', 'proof', 'actually ran', 'really ran',
      'hallucinat', 'made up', 'making it up', 'checked', 'sure',
    ],
  },

  design: {
    strong: [
      'design system', 'color palette', 'colour palette', 'typography', 'wireframe',
      'mockup', 'visual hierarchy', 'landing page', 'look and feel', 'style guide',
      'dark mode', 'light mode', 'responsive layout', 'figma', 'brand',
      'empty state', 'hover state', 'active state', 'focus state', 'focus states',
      'whitespace', 'white space', 'baseline', 'breakpoint', 'breakpoints',
      'prefers-reduced-motion', 'contrast ratio', 'above the fold', 'affordance',
      'saturated', 'desaturated', 'drop shadow', 'border radius', 'gutter',
    ],
    weak: [
      'design', 'redesign', 'layout', 'css', 'style', 'styling', 'styles', 'theme',
      'spacing', 'padding', 'margin', 'font', 'fonts', 'color', 'colour', 'colors',
      'colours', 'ui', 'ux', 'visual', 'visually', 'look', 'looks', 'polish',
      'animation', 'animate', 'transition', 'icon', 'icons', 'logo', 'sidebar',
      'navbar', 'nav', 'footer', 'header', 'modal', 'dialog', 'tooltip', 'toast',
      'button', 'buttons', 'mobile', 'desktop', 'tablet', 'responsive', 'viewport',
      'align', 'aligned', 'alignment', 'centered', 'centred', 'grid', 'flex',
      'scroll', 'overflow', 'blue', 'gray', 'grey', 'contrast', 'legible',
      'readable', 'cramped', 'crowded', 'wraps', 'wrapping', 'truncate', 'rtl',
      'accessible', 'accessibility', 'a11y', 'screen reader', 'tabbing', 'illustration',
    ],
  },
};

const STRONG_WEIGHT = 3;
const WEAK_WEIGHT = 1;

// A request has to clear both bars: enough evidence, and enough of a lead over
// the runner-up. "Redesign the database schema" hits design and engineering
// words at once, and guessing wrong is worse than staying quiet.
const MIN_SCORE = 3;
const MIN_MARGIN = 2;

// A runner-up joins the answer when it scores at least this share of the top.
// Set from the compound requests in the training half: a genuine second
// discipline usually scored around two thirds of the first, while an
// incidental word that happened to match scored far below half.
const SECOND_SHARE = 0.5;

// Below this a prompt is a conversational aside, and no guidance is worth the
// tokens. "yes", "thanks", "what did that do", "run it again".
const MIN_PROMPT_CHARS = 25;

/** Count non-overlapping whole-word hits, so "api" does not match "rapid". */
function hits(haystack, needles) {
  let found = 0;
  const matched = [];
  for (const needle of needles) {
    const pattern = new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
    if (pattern.test(haystack)) { found += 1; matched.push(needle); }
  }
  return { found, matched };
}

/**
 * Decide which mode a prompt belongs to.
 *
 * Returns null when the answer is not clear, and null is the common case by
 * design. Injecting nothing is always cheaper than injecting the wrong thing.
 *
 * `config` may add custom modes, disable built-in ones, and move the
 * thresholds. It comes from loadConfig, which is where the trust rules live:
 * by the time a custom mode reaches this function it has already been
 * approved, validated, and framed.
 */
function route(prompt, config = {}) {
  if (typeof prompt !== 'string') return null;

  const text = prompt.trim();

  // Thresholds are validated, not merely type-checked. A negative minScore
  // means every prompt clears the bar, which turns the router into a machine
  // that injects something on every turn, silently, from a config file. That
  // is the failure mode the whole abstention design exists to prevent.
  const bounded = (value, fallback, min, max) => (
    Number.isFinite(value) && value >= min && value <= max ? value : fallback
  );
  const t = config.thresholds || {};
  const minScore = bounded(t.minScore, MIN_SCORE, 1, 100);
  const minMargin = bounded(t.minMargin, MIN_MARGIN, 0, 100);
  const minChars = bounded(t.minPromptChars, MIN_PROMPT_CHARS, 1, 10000);

  // The length gate exists to keep "yes" and "thanks" free. But the prompts
  // that most need the verification block are short by nature: "are you sure"
  // is thirteen characters and is exactly the moment to say so. A specific
  // multi-word phrase is evidence on its own, so those bypass the gate. Single
  // words never do, which is what keeps the gate meaningful.
  const lowered = text.toLowerCase();
  const shortcut = (MODES.verification.strong)
    .some((phrase) => lowered.includes(phrase));

  if (text.length < minChars && !shortcut) return null;

  // Built-ins plus any custom modes, minus anything switched off. A project
  // that disables every mode gets silence, which is a legitimate choice.
  const disabled = new Set(config.disable || []);
  const active = {};
  for (const [name, sets] of Object.entries({ ...MODES, ...(config.modes || {}) })) {
    if (!disabled.has(name)) active[name] = sets;
  }
  if (!Object.keys(active).length) return null;

  // Strip fenced code and quoted blocks before scoring. A pasted stack trace
  // is context for the request, not the request itself, and letting it vote
  // turns every paste into an engineering task.
  const scored = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*>.*$/gm, ' ')
    .toLowerCase();

  // Paths named in the prompt are evidence too. Weighted low on purpose: a
  // request that says "rewrite the docs in src/api" should still be able to
  // land on prose rather than being dragged to engineering by the directory.
  const pathScores = fromPaths(text, config);

  const results = [];
  for (const [mode, sets] of Object.entries(active)) {
    const strong = hits(scored, sets.strong || []);
    const weak = hits(scored, sets.weak || []);
    const fromPath = pathScores[mode] || 0;
    const score = strong.found * STRONG_WEIGHT + weak.found * WEAK_WEIGHT + fromPath;
    const signals = [...strong.matched, ...weak.matched];
    if (fromPath) signals.push('(path)');
    results.push({
      mode, score, custom: Boolean(sets.custom), signals,
    });
  }

  results.sort((a, b) => b.score - a.score);
  const [top, second] = results;

  if (top.score < minScore) return null;

  // MULTI-LABEL. The original rule abstained whenever the top two were within
  // `minMargin` of each other, on the theory that a tie meant uncertainty.
  // Measured against 280 labelled prompts, that rule was the single largest
  // source of silence: 22 of 33 compound requests got nothing, because
  // "review this then write the release notes" genuinely is two disciplines
  // and a tie was the correct reading, not a confused one.
  //
  // So a near-tie now emits both. A second mode qualifies when it clears the
  // same bar and scores at least half the top. Two blocks is the cap: three
  // is most of a fixed block, which is the cost this design exists to avoid.
  const chosen = [top];
  if (second && second.score >= minScore && second.score >= top.score * SECOND_SHARE) {
    chosen.push(second);
  }

  return {
    mode: top.mode,
    score: top.score,
    custom: top.custom,
    modes: chosen.map((c) => ({ mode: c.mode, score: c.score, custom: c.custom })),
    runnerUp: second ? { mode: second.mode, score: second.score } : null,
    // Capped: the signals are for debugging and tests, not a report.
    signals: top.signals.slice(0, 8),
  };
}

module.exports = {
  route, MODES, MIN_SCORE, MIN_MARGIN, MIN_PROMPT_CHARS, SECOND_SHARE, hits,
};
