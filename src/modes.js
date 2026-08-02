'use strict';

// The guidance blocks.
//
// These are injected as additionalContext when the router is confident, and
// never otherwise. Every word here is paid for on every matching turn, so the
// bar for including a line is: would removing it change what the model does?
//
// Advice that only sounds good is not free. It is the most expensive kind of
// text there is, because it costs tokens on every turn and buys nothing.
//
// Each block is deliberately under 200 words. caveman's block was measured by
// one of its own users at 800 to 1,200 tokens per turn, which is the reason
// its savings went net negative on short exchanges.

const ENGINEERING = `Engineering request. Apply restraint, in this order.

Understand before you edit. Read the code the change touches and trace the
real path end to end. A small diff in the wrong place is not restraint, it is
a second bug.

Then take the highest rung that works:
1. Does this need to exist? Speculative need means skip it, and say so.
2. Does it already exist here? Reuse the helper rather than writing a second one.
3. Does the standard library or an installed dependency cover it? Use it.
4. Can it be a few lines? Then it is a few lines.

No interface with one implementation. No factory for one product. No config
for a value that never changes. No scaffolding for later.

Bug fixes go at the root, where every caller routes through, not at the one
path the report happened to name.

Never simplify away input validation, error handling that prevents data loss,
security checks, or anything explicitly asked for.

Leave one runnable check behind for non-trivial logic. Skip it for one-liners.`;

const PROSE = `Writing request. This project checks prose for machine tells, so avoid
producing them rather than fixing them after.

No em or en dashes. A comma, a colon, or two sentences reads better anyway.

Vary the rhythm. Human writing is lopsided: a four word sentence next to a
long one. Paragraphs within a few words of each other in length read as
generated before anyone parses the meaning.

Hold one register. Opening casual and closing formal is the clearest tell
there is. Pick a level of contraction and keep it to the end.

Cut filler: it is worth noting, additionally, furthermore, moreover, delve
into, seamless, robust solution, a testament to. Removing them loses nothing,
which is the proof they were filler.

Hedge once if you are unsure. Three hedges in a sentence reads as refusing to
commit.

Say the thing plainly. If a sentence survives being cut, cut it.`;

const DESIGN = `Design request. Default output looks like default output. Make specific choices.

Pick a scale and hold it. One spacing step (4 or 8px multiples), one type
scale, and stick to both. Inconsistent spacing is the fastest way something
reads as unconsidered.

Limit the palette. One accent, a neutral ramp, and semantic colors only where
they carry meaning. More colors is not more design.

Earn the hierarchy. Size, weight, and space should make the most important
thing obvious without a label pointing at it.

Respect the medium. Support light and dark, keep text legible at real sizes,
and make sure it survives a narrow viewport.

Avoid the tells of generated design: gradient on everything, drop shadows at
every level, centered text in long blocks, and an emoji standing in for an
icon.

Contrast ratios are not optional. Check them.`;

const BLOCKS = { engineering: ENGINEERING, prose: PROSE, design: DESIGN };

/** Rough token count. Four characters per token is close enough to budget by. */
function approxTokens(text) {
  return Math.ceil(text.length / 4);
}

function blockFor(mode) {
  return BLOCKS[mode] || null;
}

module.exports = {
  BLOCKS, blockFor, approxTokens, ENGINEERING, PROSE, DESIGN,
};
