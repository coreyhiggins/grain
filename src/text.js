'use strict';

// Splitting prose into units, and deciding what counts as prose at all.
//
// The second part matters more than it sounds. Running a style check over a
// code fence, a table, or a URL produces confident nonsense, and nonsense
// findings are how a linter gets switched off. Everything here is
// deliberately conservative: when in doubt, it is not prose.

/** Lines that are structure or code rather than sentences a person wrote. */
function isProse(line) {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith('```') || t.startsWith('~~~')) return false;
  if (t.startsWith('    ') || t.startsWith('\t')) return false; // indented code
  if (t.startsWith('|')) return false;                          // table row
  if (/^[-=]{3,}$/.test(t)) return false;                       // rule
  if (/^#{1,6}\s/.test(t)) return false;                        // heading
  if (/^!\[/.test(t)) return false;                             // image
  if (/^<[a-z/!]/i.test(t)) return false;                       // html
  if (/^\[[^\]]+\]:/.test(t)) return false;                     // link ref
  if (/^\s*[\w-]+\s*[:=]\s*\S+$/.test(t) && t.length < 60) return false; // config line
  // A line that is mostly punctuation or symbols is not prose.
  const letters = (t.match(/[a-z]/gi) || []).length;
  return letters / t.length > 0.55;
}

/**
 * Strip everything that is not prose from a markdown document, keeping line
 * numbers intact by replacing removed lines with blanks.
 */
function stripNonProse(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let inFence = false;
  let fenceMarker = '';

  for (const line of lines) {
    const t = line.trim();
    const fence = t.match(/^(```|~~~)/);

    if (fence && !inFence) { inFence = true; fenceMarker = fence[1]; out.push(''); continue; }
    if (inFence) {
      if (t.startsWith(fenceMarker)) inFence = false;
      out.push('');
      continue;
    }
    out.push(isProse(line) ? line : '');
  }
  return out.join('\n');
}

/** Inline markdown and code spans removed, so they are not counted as words. */
function clean(text) {
  return text
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_~]/g, '');
}

function words(text) {
  return (clean(text).match(/[A-Za-z][A-Za-z'’-]*/g) || []);
}

/**
 * Sentence split. Deliberately simple, and tolerant of the abbreviations
 * that would otherwise create phantom one-word sentences.
 */
function sentences(text) {
  const t = clean(text)
    .replace(/\b(e\.g|i\.e|etc|vs|Mr|Mrs|Dr|Inc|Ltd|St|approx|Fig|No)\./gi, '$1<DOT>')
    .replace(/\b([A-Z])\./g, '$1<DOT>');

  return t.split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => s.replace(/<DOT>/g, '.').trim())
    .filter(Boolean);
}

/** Blank-line separated blocks, prose only. */
function paragraphs(text) {
  return stripNonProse(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^\s*[-*+]\s/.test(p));   // list blocks are not paragraphs
}

module.exports = { isProse, stripNonProse, clean, words, sentences, paragraphs };
