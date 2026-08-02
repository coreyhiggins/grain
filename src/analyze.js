'use strict';

const { detect } = require('./tells');
const { buildProfile, compareToProfile } = require('./profile');
const { words, stripNonProse } = require('./text');

// Putting the two halves together.
//
// Findings are kept in two named groups on purpose. "This reads as generated"
// and "this does not match your project" are different claims, and a reader
// deserves to know which one they are being told. Collapsing them into a
// single score is what makes every other tool in this space unarguable.

/**
 * Analyze one piece of prose.
 *
 * Returns { tells, house, words, profile }. There is deliberately NO overall
 * score. A number invites arguing with the number instead of looking at the
 * line, and it implies a precision this cannot have.
 */
function analyze(text, options = {}) {
  const profile = options.profile === undefined
    ? buildProfile(options.cwd || process.cwd())
    : options.profile;

  const prose = stripNonProse(text);
  const count = words(prose).length;

  return {
    words: count,
    tells: count >= 25 ? detect(text) : [],
    house: profile ? compareToProfile(text, profile) : [],
    profile,
  };
}

/**
 * A one-line verdict, for callers that need something short (a hook, a CI
 * summary). Still not a score: a count of things you can go and look at.
 */
function summarize(result) {
  const t = result.tells.length;
  const h = result.house.length;
  if (!t && !h) return 'reads clean';

  const parts = [];
  if (t) parts.push(`${t} tell${t > 1 ? 's' : ''}`);
  if (h) parts.push(`${h} departure${h > 1 ? 's' : ''} from house style`);
  return parts.join(', ');
}

module.exports = { analyze, summarize };
