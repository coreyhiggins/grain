# The benchmark

```bash
node bench/run.js bench/corpus
```

Everything below is here so you can disagree with the number using evidence
instead of taste. If you find a hole in this method, open an issue and I will
publish the old and new numbers side by side.

## What is being measured

One claim, and nothing softer: **grain's findings appear more often in prose a
machine wrote than in prose a person wrote.**

That is a testable claim. "grain makes your writing better" is not, so it is
not measured here and is not claimed in the README either.

## The rules this harness follows

**House-style rules are switched off.** grain reports two kinds of finding:
universal tells, and departures from what your own project sounds like. The
second kind answers a different question, and folding it in would inflate this
number. Only the universal detectors run.

**The threshold is chosen on one half and scored on the other.** The corpus is
shuffled with a fixed seed and split. The findings-per-1,000-words cutoff is
picked on the calibration half, then scored once on a holdout that was never
consulted. Tuning and reporting on the same files produces a number that only
reproduces on the machine that made it.

**Cheap controls run alongside.** Four of them, on the same holdout:

| control | what it is |
|---|---|
| em dash search | `/[—–]/`, the single most cited AI tell |
| em dash plus 5 stock words | roughly what people paste into a system prompt |
| always say machine | recall 1.0 by cheating, precision equal to class balance |
| coin flip | seeded, the floor any real detector must clear |

If grain does not beat the best of these by at least 0.05 F1, the harness
prints that it is not earning its install and **exits non-zero.** That check
exists because of ponytail issue #126: a headline of ~54% less code turned out
to have been measured against a baseline with no system prompt, and adding one
sentence to the control took it from 108 lines to 16. The tool was still
ahead. The headline was not. A benchmark without a cheap control measures
enthusiasm.

**Confidence intervals, not point estimates.** F1 is bootstrapped over 1,000
seeded resamples and reported as a 95% interval. If that interval is wider
than 0.35 the harness warns that the holdout is too small to quote. No other
project in this category publishes variance at all.

**Per-rule numbers are published, including the duds.** Any detector that
fires more often on human prose than machine prose is printed as `INVERTED`.
A rule that earns that label is not detecting what it claims to and gets cut,
the way the tricolon detector already was. Hiding a bad rule would make every
other number here worth less.

## The corpus

Every file is listed in `corpus/manifest.json` with its bucket, its source,
and why the label holds. A benchmark whose labels cannot be checked is an
assertion, so the harness refuses to run without that file.

## Results so far

Run 2026-08-01. Three corpora, same harness, same rules.

| Corpus | Human | Machine | grain F1 | Best control | Margin |
|---|---|---|---|---|---|
| HC3 chat, finance only | 21 files | 21 files, ChatGPT 2022 | **0.88** [0.73, 1.00] | 0.69 | +0.19 |
| HC3 chat, all configs | 111 files | 111 files, ChatGPT 2022 | 0.75 [0.65, 0.83] | 0.70 | +0.05 |
| Technical documentation | 10 files, 2016-2018 | 20 files, Claude Opus 5 | 0.43 [0.00, 0.71] | 0.70 | -0.27 |

The finance row is the honest one. The other two are published because leaving
them out would misrepresent what was measured.

**Why the all-configs row is not the headline.** Ninety-six of its 111 human
files contain no line break at all, and 42 carry upstream word tokenization
(`should n't`, spaces before punctuation) present in zero machine files. Both
artifacts separate the buckets almost perfectly while measuring nothing about
writing. A paragraph-uniformity check scored 0.00 against 0.65 on that corpus
purely because one side had no paragraphs to measure. The finance config is the
only one free of both artifacts, which is why it is the cut that counts.

**Why the documentation row is published at all.** It is grain losing, by a
wide margin, to a predictor with no logic in it. Claude Opus 5 wrote cleaner
documentation than the humans did by grain's own measure. That is a real result
about where this tool does not work.

### Rules that ran backwards

`dash` was `INVERTED` on all three corpora. Humans used 22 em and 14 en dashes
across 19,409 words; 2022 ChatGPT used **zero** across 20,090. Every
alternative dash codepoint was checked. The em dash is the most widely cited
marker of machine writing, and in this data it points the other way.

Two limits on that. The human dashes concentrate in 11 of 111 files, several
inside a bibliography and numeric date ranges rather than prose style. And the
Claude Opus 5 samples were generated in an environment whose house rules forbid
em dashes, so their zero is not independent evidence and is not treated as any.

`stock-phrase` is the rule actually carrying the signal: 0.50 against 3.39 per
1,000 words on the clean cut, and 0.32 against 4.18 on the full chat corpus.

## What this benchmark does not tell you

- **Nothing about writing quality.** Only whether text carries countable
  markers. Prose can be free of every marker here and still be bad.
- **Nothing about newer models than the corpus contains.** Detection gets
  harder as models get better. A score measured on older generated text is an
  optimistic ceiling, not what you will see on current output. Where the
  corpus is dated, `manifest.json` carries a `caveat` field and the harness
  prints it above the results.
- **Nothing verified by anyone but me.** Every number here comes from the
  author of the thing being measured. Clone it and re-run it. That is the only
  reason to believe any of it.
