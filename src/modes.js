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

// This block used to say these markers were "machine tells" and to avoid
// producing them. Our own benchmark disproved that: the em dash rule ran
// backwards on all four corpora, and Claude Opus 5 produced zero stock phrases
// across 9,130 words. Disabling the detector did not fix the block, which was
// still asserting the rejected theory on every writing turn.
//
// So it is now what it can actually defend: a house style. Every line below is
// a preference about how prose reads, not a claim about who wrote it.
const PROSE = `Writing request. House style, applied because it reads better, not because
it detects anything.

No em or en dashes. A comma, a colon, or two sentences carries the same break
without the visual interruption.

Vary the rhythm. Writing is lopsided when it is good: a four word sentence
next to a long one. Paragraphs within a few words of each other in length read
as unedited, because nothing was ever cut or reordered.

Hold one register. Opening casual and closing formal reads as losing your
footing partway through. Pick a level of contraction and keep it to the end.

Cut filler: it is worth noting, additionally, furthermore, moreover, delve
into, seamless, robust solution, a testament to. Removing them loses nothing,
which is the proof they were filler.

Hedge once if you are unsure. Three hedges in a sentence reads as refusing to
commit to anything.

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

// Roles, not model names.
//
// Naming models in shipped guidance guarantees the guidance rots: a release is
// needed every time a model ships, and anyone on an older version gets advice
// that is confidently wrong. Roles do not change when the lineup does.
//
// NOT CONFIGURABLE. Version 0.2.0 said in this comment, and in the README,
// that a project could override this mapping from its config file. That was
// false. The config loader never read such a key, and the orchestration block
// below is fixed text that interpolates nothing. The claim was written
// alongside the intent and never checked against the code.
//
// These names exist so the orchestration block has vocabulary to reason about.
// If per-project tiers are worth having, they need real config plumbing and a
// block that actually substitutes them.
const TIERS = {
  orchestrator: 'the session model',
  hard: 'the strongest available model',
  workhorse: 'a mid-tier model',
  scout: 'a mid-tier model at low effort',
};

const ORCHESTRATION = `Planning or delegation request. Your tokens go to decomposition, review and
integration, not to typing.

Write the spec first, then decompose it into briefs an agent can execute
without you. Agents share none of your context, so a brief that assumes it
produces confident wrong work.

Every brief carries: the goal and its acceptance criteria, exact paths, the
file to mirror for idiom, the project guardrails, the verification the agent
must run, and the shape of the report you want back.

Route by difficulty, not by habit. Searches, inventories and mechanical edits
go to the cheapest tier. Bounded work against a spec goes to the workhorse
tier, where the brief carries the quality. Security, concurrency, money, and
adversarial verification start at the strongest tier with no cheap trial run.
A worker that fails its checklist twice escalates rather than retrying cheap.

Hard rules, each of which has cost somebody real work:
- Workers do not sub-delegate. Say so in every brief.
- One repository, one agent. Git HEAD is per worktree, so a second agent moves
  the first one's HEAD and its commit lands on the wrong branch. Same for a
  browser session.
- Evidence before diagnosis. Read the logs and the data before proposing a
  cause. "The data does not show this" is a valid finding.
- Verify with your own eyes before reporting done. An agent's report is a
  claim, not a verification.
- Whoever verifies must be at least the tier that built it.

Parallelize independent briefs. Serialize anything sharing mutable state.`;

// Two labellers, working independently and without seeing each other's output,
// both flagged the same hole in the four-mode taxonomy: prompts that challenge
// the assistant's account of its own work fit none of them.
//
//   "did you actually run it or are you guessing"
//   "which file did you change"
//   "what did that do"
//
// One of them put it better than I would have: these matter more than they
// look, because they are exactly where an assistant bluffs. The useful
// guidance is about evidence and honest reporting, which is not engineering,
// prose, design, or planning.
const VERIFICATION = `Someone is asking you to account for your own work. Answer from evidence,
not from memory of what you intended.

If you did not run it, say you did not run it. "It should work" and "I ran it
and it passed" are different claims, and only one of them is checkable. Say
which one you are making.

Re-read the file before describing what is in it. What you wrote earlier and
what is on disk now are different things, and an edit that failed silently
looks exactly like one that worked.

Name the specific thing: the file, the line, the command, the output. A claim
that cannot be checked is not an answer.

If you cannot verify something, say so and say what would settle it. That is a
complete answer. Guessing with confidence is not.

If you got it wrong, correct it plainly and move on. Do not re-explain the
mistake at length or apologise repeatedly.`;

const BLOCKS = {
  engineering: ENGINEERING,
  prose: PROSE,
  design: DESIGN,
  orchestration: ORCHESTRATION,
  verification: VERIFICATION,
};

/** Rough token count. Four characters per token is close enough to budget by. */
function approxTokens(text) {
  return Math.ceil(text.length / 4);
}

function blockFor(mode) {
  return BLOCKS[mode] || null;
}

module.exports = {
  BLOCKS, blockFor, approxTokens, TIERS,
  ENGINEERING, PROSE, DESIGN, ORCHESTRATION,
};
