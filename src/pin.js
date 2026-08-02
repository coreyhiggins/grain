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

const DIR = path.join(os.homedir(), '.grain');
const FILE = path.join(DIR, 'state.json');

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
    pinned: Boolean(decision.pinnedBy),
    at: new Date().toISOString(),
  } : { modes: [], at: new Date().toISOString() };
  write(state);
}

const last = () => read().last || null;

module.exports = {
  pin, unpin, pinned, setEnabled, isEnabled, remember, last, FILE,
};
