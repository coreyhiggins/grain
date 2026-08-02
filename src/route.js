'use strict';

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
const MODES = {
  engineering: {
    strong: [
      'refactor', 'implement', 'debug', 'stack trace', 'traceback', 'null pointer',
      'race condition', 'memory leak', 'regression', 'unit test', 'integration test',
      'pull request', 'merge conflict', 'endpoint', 'middleware', 'migration',
      'compile', 'build error', 'type error', 'linter', 'segfault', 'deadlock',
    ],
    weak: [
      'function', 'class', 'method', 'variable', 'component', 'module', 'api',
      'bug', 'error', 'crash', 'fails', 'broken', 'test', 'tests', 'script',
      'handler', 'service', 'database', 'query', 'schema', 'cache', 'parser',
      'fix', 'add', 'build', 'create', 'wire', 'hook up', 'integrate', 'optimize',
      'rename', 'extract', 'inline', 'patch', 'deploy', 'rollback',
    ],
  },

  prose: {
    strong: [
      'readme', 'changelog', 'release notes', 'commit message', 'blog post',
      'documentation', 'docs for', 'announcement', 'cover letter', 'press release',
      'newsletter', 'article', 'write up', 'writeup', 'user guide', 'tutorial for',
    ],
    weak: [
      'write', 'draft', 'rewrite', 'reword', 'proofread', 'edit', 'wording',
      'copy', 'email', 'message', 'post', 'summary', 'summarize', 'explain to',
      'tone', 'phrasing', 'paragraph', 'headline', 'tagline',
    ],
  },

  orchestration: {
    strong: [
      'orchestrate', 'delegate', 'sub-agent', 'subagent', 'subagents', 'fan out',
      'break this down', 'break it down', 'decompose', 'write a spec', 'spec out',
      'project plan', 'roadmap', 'milestones', 'in parallel', 'parallelize',
      'kick off agents', 'dispatch', 'work breakdown',
    ],
    weak: [
      'plan', 'planning', 'phases', 'sequence', 'coordinate', 'scope', 'brief',
      'briefs', 'estimate', 'timeline', 'approach', 'strategy', 'split',
      'assign', 'workers', 'review their', 'verify',
    ],
  },

  design: {
    strong: [
      'design system', 'color palette', 'colour palette', 'typography', 'wireframe',
      'mockup', 'visual hierarchy', 'landing page', 'look and feel', 'style guide',
      'dark mode', 'responsive layout', 'figma', 'brand',
    ],
    weak: [
      'design', 'layout', 'css', 'style', 'styling', 'theme', 'spacing', 'padding',
      'margin', 'font', 'color', 'colour', 'ui', 'ux', 'visual', 'look', 'polish',
      'animation', 'transition', 'icon', 'logo',
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

  if (text.length < minChars) return null;

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

  const results = [];
  for (const [mode, sets] of Object.entries(active)) {
    const strong = hits(scored, sets.strong || []);
    const weak = hits(scored, sets.weak || []);
    const score = strong.found * STRONG_WEIGHT + weak.found * WEAK_WEIGHT;
    results.push({
      mode, score, custom: Boolean(sets.custom), signals: [...strong.matched, ...weak.matched],
    });
  }

  results.sort((a, b) => b.score - a.score);
  const [top, second] = results;

  if (top.score < minScore) return null;
  if (top.score - (second ? second.score : 0) < minMargin) return null;

  return {
    mode: top.mode,
    score: top.score,
    custom: top.custom,
    runnerUp: second ? { mode: second.mode, score: second.score } : null,
    // Capped: the signals are for debugging and tests, not a report.
    signals: top.signals.slice(0, 8),
  };
}

module.exports = {
  route, MODES, MIN_SCORE, MIN_MARGIN, MIN_PROMPT_CHARS, hits,
};
