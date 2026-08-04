---
name: voice
description: Write prose that sounds like this project instead of like a model. Use when writing or editing any README, doc, comment, commit message, changelog, issue, PR description, or user-facing copy.
---

# Writing in this project's voice

Detecting a tell after the fact is a repair. Not producing it is the actual
goal. This skill is the front half of grain: it tells you what this specific
repository sounds like, before you write, so there is nothing to correct.

## First, look at what the project actually does

Run this before writing prose of any length:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/grain.js" profile
```

It reports, measured from this repo's own markdown and commit history:

- em and en dash count, total and per 10,000 words
- what share of contractible phrases are actually contracted
- mean sentence and paragraph length, and how much each varies
- mean commit subject length and body line count

**Match those numbers.** They are not style advice, they are what the people
here already do. A repo whose commit subjects average 44 characters does not
want a 90 character one from you.

If confidence comes back `insufficient` there is not enough prose to imitate.
Fall back to the general rules below and say nothing about house style.

## The tells worth avoiding while writing

These are the countable ones, which is why they are the ones grain checks.

**Em and en dashes.** The single most recognizable marker. A comma, a colon,
or two sentences almost always reads better anyway.

**Uniform rhythm.** Paragraphs within a few words of each other in length, or
every sentence the same size, reads generated before anyone parses a word.
Human writing is lopsided because some points need three words and some need
thirty. A short sentence after a long one does more work than any word choice.

**Setup, colon, payoff, repeatedly.** Once is punctuation. Four times on a
page is a rhythm, and it is the most recognizable generated sentence shape.

**Register drift.** Opening with "I'm" and closing with "It is" is the tell
that gives away cover letters. Pick a level of formality and hold it to the
end. A steady 60% contraction rate is a voice; sliding from 90% to 20% is a
model losing its footing.

**Stock filler.** "It's worth noting", "Additionally", "Furthermore",
"Moreover", "delve into", "seamless", "robust solution", "a testament to".
Cutting these almost never loses meaning, which is the proof they were filler.

**Stacked hedges.** One hedge is honest. Three in a sentence reads as refusing
to commit. Say the thing, or say once that you are unsure.

## What this is not

This is not a rule against writing carefully. Long sentences are fine. Colons
are fine. The failure mode being avoided is uniformity: text where every
paragraph is the same shape because nothing was ever cut or reordered.

Do not apply any of this to code, tables, config, log output, or quoted
material. Those are not prose and grain does not check them.

## Before you finish

If the prose is longer than a paragraph or two, check it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/grain.js" check <file>
```

Findings that stand, fix. Findings that are wrong, say so out loud rather than
rewriting good prose to satisfy a counter.
