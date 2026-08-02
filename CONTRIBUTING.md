# Contributing

## The bar for a new detector rule

A rule gets in when it is **countable**. Somebody shown the finding must be
able to look at the line and agree or disagree. If the only defence of a
finding is that the text reads like a machine wrote it, the rule does not
belong here.

Concretely, a new rule needs:

1. **A finding that names a line and a count.** Not a verdict, not a score.
2. **A false-positive test.** Every detector is a heuristic, so each one needs
   a case proving it stays quiet on prose a person actually wrote. That half of
   the test file matters more than the other half.
3. **A benchmark run showing it separates the buckets.** `node bench/run.js`
   prints per-rule numbers for both buckets. A rule that fires as often on
   human prose is not detecting anything.

## The bar for cutting one

**A rule marked `INVERTED` by the benchmark fires more on human prose than on
machine prose.** That is not a tuning problem, it is a rule measuring something
other than what it claims.

This has happened. A tricolon detector flagged "Works with Claude Code, Cursor,
and Codex CLI" as a rhetorical rule of three, and three of its first four
findings on real prose were wrong. It was removed rather than tuned, and the
reason is still in `src/tells.js` where the code used to be.

A detector that is wrong most of the time is worse than a missing one. It
teaches people to dismiss the output, and then the accurate findings go unread.

If you cut a rule, leave the reason in the source. The next person will
otherwise reinvent it.

## The bar for a mode

Guidance blocks are injected on every matching turn, so every line is paid for
repeatedly. The test for including a line is: **would removing it change what
the model does?**

Advice that only sounds good is the most expensive text there is. It costs
tokens forever and buys nothing. Keep blocks under 200 words, and there is a
test that fails if one grows past 400 tokens.

## Benchmarks

If you change a detector, run the benchmark and paste both the before and after
numbers in the pull request. If the change makes a rule worse, say so. The
harness exits non-zero when grain fails to beat its own controls, and that is
working as intended.

Do not tune a threshold against the holdout. The split exists so the reported
number means something, and consulting the holdout to pick a value quietly
destroys that.

## House style

- **No em or en dashes** in documentation. CI enforces it. A comma, a colon, or
  two sentences reads better anyway.
- Match the comment density already in the file you are editing.
- Commit subjects stay under 55 characters, imperative, no trailing period.
  Most commits need no body.

## Running things

```bash
node test/run-tests.js
```

```bash
node bench/run.js <corpus-dir>
```

No dependencies, no build step, no framework. It runs on a clean checkout with
Node 18 or later. Please keep it that way.
