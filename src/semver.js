'use strict';

// Comparing version strings, because sorting them as text is wrong.
//
// Both the plugin scanner and the diagnostic picked the newest installed
// version with `.sort().pop()`. Sorted as text, "0.9.0" comes after "0.10.1",
// so both were reading a stale copy. The diagnostic reported the wrong version
// and skill discovery was indexing an old plugin's skills.
//
// Not a semver implementation. It compares dotted numeric parts, ignores any
// prerelease suffix, and that covers plugin cache directory names.

/** Negative if a is older, positive if newer, zero if equal. */
function compare(a, b) {
  const parts = (v) => String(v).split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  const len = Math.max(x.length, y.length);

  for (let i = 0; i < len; i += 1) {
    const diff = (x[i] || 0) - (y[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** The newest of a list of version strings, or null. */
function newest(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return [...list].sort(compare).pop();
}

module.exports = { compare, newest };
