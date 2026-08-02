'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

// Carrying the mode across a short follow-up.
//
// THE PROBLEM, measured.
//
// The router sees one prompt. Real conversations do not work that way:
// somebody says "the users list loads twice on mount", gets an answer, and
// then says "yeah fix it". That second turn carries no signal at all, and on
// a labelled corpus 12 of 20 follow-ups got nothing for exactly this reason.
// Follow-ups were 31 percent of the corpus.
//
// THE RISK, which is why this is narrow.
//
// Inheritance is a guess about a turn the router cannot see. Guess wrong and
// it injects the wrong discipline, which costs tokens AND points the model
// somewhere unhelpful, and that is worse than saying nothing. So the
// conditions are deliberately tight:
//
//   1. Only when the router itself found nothing. A real signal always wins.
//   2. Only when the prompt LOOKS like a continuation: short, or opening with
//      a word that refers back. "fix the login page" is not a follow-up just
//      because it is short.
//   3. Only for a few turns, and only for a few minutes. A mode from twenty
//      minutes ago is archaeology, not context.
//   4. Never for the verification mode. "are you sure" is about the last
//      answer; inheriting it would keep second-guessing turns later.
//
// State lives in the system temp directory, keyed by a hash of the session id.
// Never the project.

const STATE_DIR = path.join(os.tmpdir(), 'grain-session');
const MAX_INHERIT_TURNS = 3;
const MAX_AGE_MS = 10 * 60 * 1000;
const SHORT_PROMPT_WORDS = 8;

// Openers that point at something already said. A prompt starting with one of
// these is talking about the previous turn almost by definition.
const CONTINUATION = /^(and|also|now|then|next|ok|okay|yes|yeah|yep|sure|do it|do that|same|again|actually|no|wait|hmm|undo|revert|instead|what about|how about|why|that one|the other)\b/i;

// A mode nobody should inherit: it is about the answer just given.
const NEVER_INHERIT = new Set(['verification']);

function statePath(sessionId) {
  const key = crypto.createHash('sha256').update(String(sessionId || 'nosession')).digest('hex').slice(0, 16);
  return path.join(STATE_DIR, `${key}.json`);
}

function read(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(statePath(sessionId), 'utf8'));
  } catch {
    return null;
  }
}

/** Never throws. Failing to record simply means the next turn does not inherit. */
function remember(sessionId, mode, at) {
  if (!sessionId || !mode || NEVER_INHERIT.has(mode)) return;
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(statePath(sessionId), JSON.stringify({ mode, at, turns: 0 }));
  } catch { /* best effort */ }
}

/** Record that a turn passed without a fresh signal, so inheritance ages out. */
function ageOne(sessionId) {
  const state = read(sessionId);
  if (!state) return;
  try {
    fs.writeFileSync(statePath(sessionId), JSON.stringify({ ...state, turns: (state.turns || 0) + 1 }));
  } catch { /* best effort */ }
}

/**
 * Does this prompt read as a continuation of the turn before it?
 *
 * Length alone is not enough. "fix the crash" is short and complete; "yeah do
 * that one too" is short and dependent. The opener is what distinguishes them,
 * so a prompt qualifies by being either very short or explicitly backward
 * pointing.
 */
function looksLikeFollowUp(prompt) {
  if (typeof prompt !== 'string') return false;
  const text = prompt.trim();
  if (!text) return false;

  const wordCount = text.split(/\s+/).length;
  if (CONTINUATION.test(text)) return true;
  return wordCount <= SHORT_PROMPT_WORDS;
}

/**
 * The mode to fall back to, or null.
 *
 * `now` is injectable so tests do not depend on the clock.
 */
function inherited(sessionId, prompt, now = Date.now()) {
  if (!looksLikeFollowUp(prompt)) return null;

  const state = read(sessionId);
  if (!state || !state.mode) return null;
  if (NEVER_INHERIT.has(state.mode)) return null;
  if ((state.turns || 0) >= MAX_INHERIT_TURNS) return null;
  if (now - (state.at || 0) > MAX_AGE_MS) return null;

  return state.mode;
}

module.exports = {
  inherited, remember, ageOne, looksLikeFollowUp,
  STATE_DIR, MAX_INHERIT_TURNS, MAX_AGE_MS, NEVER_INHERIT, CONTINUATION,
};
