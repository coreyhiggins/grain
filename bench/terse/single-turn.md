# The single-turn measurement

The batch test asked six questions in one turn. That flattered the block,
because it was injected once and paid off against six answers. In real use the
hook fires **per turn**, so the honest shape is one question, one injection.

Same model, two separate threads, one question:

> Which npm flag installs a package without saving it to package.json?

**Baseline**

```
Use the `--no-save` flag:

```bash
npm install <package-name> --no-save
```
```

76 characters, about 19 tokens.

**With the terseness block**

```
`npm install <package> --no-save`
```

33 characters, about 9 tokens.

## The arithmetic

| | tokens |
|---|---|
| output saved | 10 |
| block cost, input | 143 |
| **net** | **-133** |

The block is roughly seven times larger than the entire answer it was trying
to shorten.

## Why this is not a tuning problem

A shorter block does not fix it. The saving is bounded by how long the answer
would have been, and a question with a one-line answer has almost nothing to
cut. The block only pays for itself when the baseline answer is long, and an
answer that is long usually earned it.

Conditional injection was supposed to be the fix for caveman's known problem,
which is that a fixed block taxes every turn. Routing does solve the tax on
turns where it stays silent. It does not solve the case where the block is
bigger than the thing it is shrinking, and that case is precisely the one this
mode was built for.

## What was done about it

The mode is not routed to. It exists only behind `grain pin terse` for anyone
who wants it deliberately, and this file is why.
