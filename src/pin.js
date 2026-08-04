'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Manual override.
//
// Auto-detection is the default and the point. But a router that cannot be
// corrected is a router you argue with, and the honest reading of a 38 percent
// coverage number is that it will be wrong often enough to need an override.
//
// WHY THIS IS NOT PER-SESSION.
//
// A slash command runs as a shell command. It receives no session id, so it
// cannot write state the way the hook does. Pinning therefore lives in user
// state and persists until cleared, which is also the behaviour people expect
// from something they turned on deliberately.
//
// The last-decision record exists so `grain why` can answer the question that
// makes an automatic tool trustworthy: what did you just do to my prompt, and
// what made you think that.
//
// THE LOG, and why one decision was not enough.
//
// grain published a routing coverage figure of 51% for most of its life. The
// real figure on prompts people type was 13%, and finding that out meant
// reading 2,727 transcripts by hand, because the tool kept no record of its own
// behaviour. It knew what it did on the last turn and nothing before that.
//
// So the same record now appends to a small ring instead of being overwritten.
// It is the cheapest possible fix for the specific failure of shipping a wrong
// number for a year, and it costs one extra array write per prompt.
//
// WHAT IT DELIBERATELY CANNOT DO. There is still no prompt text here, so this
// measures COVERAGE and never correctness: how often grain speaks, which modes
// it picks, how often the fallback carries a turn. Recall needs labels, labels
// need the words, and the words are not grain's to keep. A tool that quietly
// accumulated everything its user typed would be a worse thing than a tool with
// an optimistic benchmark.

const DIR = path.join(os.homedir(), '.grain');
const FILE = path.join(DIR, 'state.json');

// Enough to see a pattern, small enough that state.json stays a file you can
// open and read. At roughly 120 bytes an entry this stays under 60KB.
const LOG_LIMIT = 500;

function read() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Never throws. Losing this file only means losing an override. */
function write(next) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
    return true;
  } catch {
    return false;
  }
}

function pin(mode) {
  const state = read();
  state.pinned = mode;
  state.pinnedAt = new Date().toISOString();
  return write(state) ? mode : null;
}

function unpin() {
  const state = read();
  const was = state.pinned || null;
  delete state.pinned;
  delete state.pinnedAt;
  write(state);
  return was;
}

function setEnabled(on) {
  const state = read();
  state.disabled = !on;
  return write(state);
}

const isEnabled = () => !read().disabled;
const pinned = () => read().pinned || null;

/**
 * Record what the last turn decided, for `grain why`.
 *
 * Deliberately small: the mode, what matched, and the token cost. Never the
 * prompt itself, so this file stays safe to look at and safe to leave lying
 * around in a temp directory.
 */
function remember(decision) {
  const state = read();
  state.last = decision ? {
    modes: (decision.modes || []).map((m) => m.mode),
    score: decision.score,
    signals: (decision.signals || []).slice(0, 8),
    inherited: Boolean(decision.inherited),
    fallback: Boolean(decision.fallback),
    pinned: Boolean(decision.pinnedBy),
    at: new Date().toISOString(),
  } : { modes: [], at: new Date().toISOString() };

  // Silent turns are logged too, and they are the important half. A log of
  // only the turns grain spoke on would show a tool that always has an answer,
  // which is exactly the illusion the 51% figure created.
  const log = Array.isArray(state.log) ? state.log : [];
  log.push(state.last);
  state.log = log.slice(-LOG_LIMIT);

  write(state);
}

/**
 * What the log says about grain's own behaviour.
 *
 * Coverage only. See the note at the top of this file for why there is no
 * accuracy number here and why there is not going to be one.
 */
function stats(entries) {
  const log = Array.isArray(entries) ? entries : (Array.isArray(read().log) ? read().log : []);
  if (!log.length) return null;

  const modes = new Map();
  let spoke = 0;
  let inherited = 0;
  let fallback = 0;
  for (const entry of log) {
    if (!entry || !Array.isArray(entry.modes) || !entry.modes.length) continue;
    spoke += 1;
    if (entry.inherited) inherited += 1;
    if (entry.fallback) fallback += 1;
    for (const m of entry.modes) modes.set(m, (modes.get(m) || 0) + 1);
  }

  return {
    turns: log.length,
    spoke,
    silent: log.length - spoke,
    inherited,
    fallback,
    modes: [...modes].sort((a, b) => b[1] - a[1]),
    since: log[0] && log[0].at,
  };
}

const last = () => read().last || null;

module.exports = {
  pin, unpin, pinned, setEnabled, isEnabled, remember, last, stats, FILE, LOG_LIMIT,
};
