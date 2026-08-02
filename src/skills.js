'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Surfacing the skill you already installed and forgot you had.
//
// THE PROBLEM THIS SOLVES.
//
// A skill's body loads when Claude judges it relevant to your prompt. That
// judgement is a model call on a one-line description, and it misses. People
// have written up the failure repeatedly, and the fix has been hand-rolled at
// least three separate times, always in the same shape: match the prompt
// against skill descriptions with plain string matching, and name the top few.
//
// Anthropic's own documentation points the same way. On what to do when a
// skill stops influencing behaviour, it says to use hooks to enforce things
// deterministically, because hooks "apply regardless of what Claude decides".
//
// WHAT THIS DELIBERATELY DOES NOT DO.
//
// It does not load a skill, and it does not tell Claude to. It names up to
// three candidates and stops. A wrong suggestion is then something the model
// ignores, rather than something that derails the turn. Determinism is worth
// having on the SURFACING step; it is not worth having on the decision.
//
// It also never reads a skill body. Only the frontmatter name and description,
// which is what the model already sees anyway.

const FRONTMATTER_BYTES = 4096;
// Raised from 200 after the cap silently truncated: this machine has 543
// skill and agent files, so the scan stopped before reaching half of them and
// a design prompt matched nothing because the design plugin was never read.
const MAX_SKILLS = 1200;
const MAX_SUGGESTIONS = 3;
// Raised alongside IDF weighting. Weights run up to 3 per word, so the old
// threshold of 2 could be cleared by a single uncommon word, and "thanks that
// worked" started drawing suggestions off the word "worked".
const MIN_SCORE = 4.5;

// One word is a coincidence. A suggestion needs either two distinct matches
// or the skill named outright.
const MIN_DISTINCT = 2;
const DESC_CHARS = 110;

// Words too common to carry signal. A skill whose description contains "file"
// should not match every prompt that mentions a file.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while',
  'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'into', 'about',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did',
  'this', 'that', 'these', 'those', 'it', 'its', 'as', 'not', 'no', 'any',
  'can', 'will', 'would', 'should', 'could', 'may', 'might', 'must',
  'you', 'your', 'i', 'me', 'my', 'we', 'our', 'they', 'them', 'their',
  'use', 'used', 'using', 'user', 'run', 'get', 'set', 'make', 'new', 'all',
  'skill', 'skills', 'claude', 'code', 'agent', 'agents', 'task', 'tasks',
  'file', 'files', 'project', 'projects', 'work', 'working', 'help', 'need',
  'trigger', 'triggers', 'invoke', 'load', 'loads', 'want', 'wants', 'like',
  'also', 'more', 'most', 'other', 'than', 'each', 'one', 'two', 'via',
]);

/** Directories where a user's own skills live. */
function skillRoots(cwd = process.cwd()) {
  return [
    path.join(os.homedir(), '.claude', 'skills'),
    path.join(path.resolve(cwd), '.claude', 'skills'),
  ];
}

/**
 * Directories holding agent definitions.
 *
 * Agents are flat `<name>.md` files rather than `<name>/SKILL.md`, but the
 * frontmatter is the same shape: a name and a description written to say when
 * the thing applies. So the same matcher works on both, and people forget
 * which agents they have installed for exactly the same reason they forget
 * skills.
 */
function agentRoots(cwd = process.cwd()) {
  return [
    path.join(os.homedir(), '.claude', 'agents'),
    path.join(path.resolve(cwd), '.claude', 'agents'),
  ];
}

// Plugins ship their own skills and agents, and an earlier version of this
// ignored them entirely while the README claimed to search "every installed
// skill". On this machine that was 543 files invisible to the matcher against
// 32 it could see.
const PLUGIN_CACHE = path.join(os.homedir(), '.claude', 'plugins', 'cache');
const CACHE_FILE = path.join(os.tmpdir(), 'grain-index.json');

/**
 * Pull `name` and `description` out of YAML frontmatter, line by line.
 *
 * This started as a regex and got the wrong answer on the first real skill it
 * met. `description: >` is a YAML block scalar, so the value is the indented
 * lines underneath, and the regex captured the ">" and stopped. That skill's
 * description is where all its trigger words live, so it silently matched
 * nothing. Walking lines handles block scalars, plain values, and wrapped
 * continuations without pretending to be a YAML parser.
 */
function parseFrontmatter(raw) {
  // Normalise line endings first. A CRLF file silently produced zero fields,
  // because "." in a JavaScript regex does not match "\r", so every key line
  // failed to match and the skill vanished from the results with no error.
  // On Windows that is most of them.
  const text = String(raw).replace(/\r\n?/g, '\n');

  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  const block = end === -1 ? text.slice(3) : text.slice(3, end);
  const lines = block.split('\n');

  const fields = {};
  let key = null;
  let parts = [];

  const flush = () => {
    if (key) fields[key] = parts.join(' ').replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
  };

  for (const line of lines) {
    const start = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s?(.*)$/);
    if (start) {
      flush();
      key = start[1].toLowerCase();
      // ">" and "|" introduce a block scalar: the value is what follows.
      parts = /^[>|][-+]?$/.test(start[2].trim()) ? [] : [start[2]];
    } else if (key && line.trim()) {
      parts.push(line.trim());
    }
  }
  flush();

  if (!fields.name && !fields.description) return null;
  return { name: fields.name || null, description: fields.description || '' };
}

/** Read just enough of a file to parse its frontmatter. */
function readHead(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(FRONTMATTER_BYTES);
    const read = fs.readSync(fd, buf, 0, FRONTMATTER_BYTES, 0);
    fs.closeSync(fd);
    return buf.slice(0, read).toString('utf8');
  } catch {
    return null;
  }
}

/** Every `<dir>/agents` and `<dir>/skills` under the plugin cache, bounded. */
function pluginRoots() {
  const roots = [];
  let marketplaces;
  try { marketplaces = fs.readdirSync(PLUGIN_CACHE, { withFileTypes: true }); } catch { return roots; }

  for (const market of marketplaces) {
    if (!market.isDirectory()) continue;
    let plugins;
    try { plugins = fs.readdirSync(path.join(PLUGIN_CACHE, market.name), { withFileTypes: true }); } catch { continue; }

    for (const plugin of plugins) {
      if (!plugin.isDirectory()) continue;
      const pluginDir = path.join(PLUGIN_CACHE, market.name, plugin.name);
      let versions;
      try { versions = fs.readdirSync(pluginDir, { withFileTypes: true }); } catch { continue; }

      // Old versions linger in the cache. Only the newest is installed.
      const latest = versions.filter((v) => v.isDirectory()).map((v) => v.name).sort().pop();
      if (!latest) continue;
      roots.push({ plugin: plugin.name, dir: path.join(pluginDir, latest) });
    }
  }
  return roots;
}

/** A cheap signature of every root, so the index only rebuilds when one changes. */
function signature(roots) {
  return roots.map((r) => {
    try { return `${r}:${fs.statSync(r).mtimeMs}`; } catch { return `${r}:0`; }
  }).join('|');
}

/**
 * Find installed skills and agents.
 *
 * Reads only the first few KB of each file, which is enough for frontmatter.
 * Even so, a machine with many plugins has hundreds of these, and this runs on
 * every prompt, so the result is cached in temp and rebuilt only when one of
 * the directories changes.
 */
function discoverAll(cwd = process.cwd(), options = {}) {
  const skillDirs = skillRoots(cwd);
  const agentDirs = agentRoots(cwd);
  const plugins = pluginRoots();
  const watched = [...skillDirs, ...agentDirs, PLUGIN_CACHE, ...plugins.map((p) => p.dir)];
  const sig = signature(watched);

  if (options.cache !== false) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (cached.signature === sig) return cached.items;
    } catch { /* rebuild */ }
  }

  const found = [];
  const seen = new Set();

  const addSkillDir = (root, prefix) => {
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (found.length >= MAX_SKILLS) return;
      if (!entry.isDirectory()) continue;
      const meta = parseFrontmatter(readHead(path.join(root, entry.name, 'SKILL.md')) || '');
      if (!meta) continue;
      const name = prefix ? `${prefix}:${meta.name || entry.name}` : (meta.name || entry.name);
      if (seen.has(name)) continue;
      seen.add(name);
      found.push({ name, description: meta.description, kind: 'skill' });
    }
  };

  const addAgentDir = (root, prefix) => {
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (found.length >= MAX_SKILLS) return;
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const meta = parseFrontmatter(readHead(path.join(root, entry.name)) || '');
      if (!meta) continue;
      const bare = meta.name || entry.name.replace(/\.md$/, '');
      const name = prefix ? `${prefix}:${bare}` : bare;
      if (seen.has(name)) continue;
      seen.add(name);
      found.push({ name, description: meta.description, kind: 'agent' });
    }
  };

  for (const root of skillDirs) addSkillDir(root, null);
  for (const root of agentDirs) addAgentDir(root, null);
  for (const p of plugins) {
    addSkillDir(path.join(p.dir, 'skills'), p.plugin);
    addAgentDir(path.join(p.dir, 'agents'), p.plugin);
  }

  if (options.cache !== false) {
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify({ signature: sig, items: found })); } catch { /* fine */ }
  }
  return found;
}

/** Kept for callers that only want skills. */
function discoverSkills(cwd = process.cwd(), options = {}) {
  return discoverAll(cwd, options).filter((x) => x.kind !== 'agent');
}

/**
 * Crude suffix stripping so "deploying" matches a description that says
 * "deploy". Without it, exact word-set intersection misses the most common
 * variation there is: people type verbs in whatever tense they are thinking
 * in, and skill descriptions are usually written in the infinitive.
 *
 * This is not a stemmer and does not try to be. It handles the endings that
 * actually cost matches, and leaves short words alone so "sass" does not
 * become "sas".
 */
function stem(word) {
  if (word.length < 5) return word;
  for (const [suffix, min] of [['ing', 6], ['ies', 6], ['ed', 5], ['ly', 6], ['es', 5], ['s', 5]]) {
    if (word.length >= min && word.endsWith(suffix)) {
      const base = word.slice(0, -suffix.length);
      // "running" -> "runn" -> "run"
      return base.length > 3 && base.at(-1) === base.at(-2) ? base.slice(0, -1) : base;
    }
  }
  return word;
}

const contentWords = (text) => new Set(
  String(text).toLowerCase().match(/[a-z][a-z0-9-]{2,}/g)
    ?.filter((w) => !STOPWORDS.has(w))
    .map(stem) || [],
);

/**
 * Score one skill against a prompt.
 *
 * An explicit name mention is worth more than any amount of description
 * overlap: someone who types "arcplay" has already told you what they want.
 */
/**
 * How much is a word worth as evidence?
 *
 * Widening the search from 32 items to 536 broke precision before this
 * existed. "design" appears in dozens of descriptions, so a design request
 * matched a marketing plugin and a web scraper ahead of the actual design
 * tool. A word spread across half the corpus does not tell you which half.
 *
 * So a word's weight falls as more descriptions contain it. That is inverse
 * document frequency, the standard answer to the standard problem. Still just
 * counting: no model, no network, no latency.
 */
function buildWeights(items) {
  const df = new Map();
  for (const item of items) {
    for (const w of contentWords(item.description)) df.set(w, (df.get(w) || 0) + 1);
  }
  const n = Math.max(items.length, 1);
  return (word) => {
    const seen = df.get(word) || 0;
    if (!seen) return 0;
    // Capped so one rare word cannot outrank a genuine name match.
    return Math.min(3, Math.log(n / seen));
  };
}

function scoreSkill(promptWords, promptLower, skill, weightOf) {
  // Boundary-matched, not substring. A skill called "ops" was previously
  // "named directly" by any prompt containing "operations" or "devops", which
  // put an unrelated skill at the top of the list on a score of 5.
  const bare = skill.name.toLowerCase().replace(/[-_]/g, '[-_ ]?');
  const nameHit = skill.name.length > 3
    && new RegExp(`(^|[^a-z0-9])${bare}([^a-z0-9]|$)`, 'i').test(promptLower);

  let overlap = 0;
  const matched = [];
  for (const w of contentWords(skill.description)) {
    if (promptWords.has(w)) {
      overlap += weightOf ? weightOf(w) : 1;
      matched.push(w);
    }
  }

  return {
    score: (nameHit ? 5 : 0) + overlap,
    matched: matched.slice(0, 5),
    nameHit,
  };
}

/**
 * Which skills look relevant to this prompt?
 *
 * Returns at most three, best first, or an empty array. Empty is the common
 * case and costs nothing.
 */
function matchSkills(prompt, options = {}) {
  if (typeof prompt !== 'string' || prompt.trim().length < 15) return [];

  const skills = options.skills || discoverAll(options.cwd);
  if (!skills.length) return [];

  const lower = prompt.toLowerCase();
  const promptWords = contentWords(prompt);
  if (promptWords.size < 2) return [];

  const weightOf = buildWeights(skills);

  const scored = [];
  for (const skill of skills) {
    const result = scoreSkill(promptWords, lower, skill, weightOf);
    const enough = result.nameHit || result.matched.length >= MIN_DISTINCT;
    if (enough && result.score >= MIN_SCORE) scored.push({ ...skill, ...result });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_SUGGESTIONS);
}

/** The line injected into context. Names only, never a skill's body. */
function formatSuggestions(matches) {
  if (!matches.length) return null;

  const lines = ['Installed skills that may fit this request:'];
  for (const m of matches) {
    const desc = m.description.length > DESC_CHARS
      ? `${m.description.slice(0, DESC_CHARS).trimEnd()}...`
      : m.description;
    lines.push(`- ${m.name}${desc ? `: ${desc}` : ''}`);
  }
  lines.push('Use one only if it genuinely fits. This is a list, not an instruction.');
  return lines.join('\n');
}

module.exports = {
  discoverSkills, discoverAll, agentRoots, matchSkills, formatSuggestions, parseFrontmatter,
  scoreSkill, buildWeights, contentWords, MIN_DISTINCT, skillRoots, MAX_SUGGESTIONS, MIN_SCORE,
};
