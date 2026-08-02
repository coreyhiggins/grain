# Terseness, measured

caveman's claim is shorter output. grain competes on it, on the theory that
firing a brevity block only when it helps fixes the known problem with firing
it on every turn.

```bash
node bench/terse/measure.js
```

## The result that changed the design

Six question shapes, each asked twice against the same model in separate
threads, one question per turn because that is how the hook fires.

| shape | baseline | terse | saved | net |
|---|---|---|---|---|
| one-line factual | 75 | 25 | 50 | **-93** |
| yes/no with caveat | 109 | 20 | 89 | **-54** |
| procedural how-to | 121 | 36 | 85 | **-58** |
| comparison | 353 | 78 | 275 | **+132** |
| diagnostic why | 485 | 68 | 417 | **+274** |
| recommendation | 279 | 47 | 232 | **+89** |

Block cost is 143 input tokens. Average output saved is 191, so the average
net is **+48 even at raw token parity**, and break-even is 0.75x against
providers charging 3x to 5x more for output than input.

## What this overturned

The first version of this mode fired on questions that *look* like they want a
short answer: "syntax for", "which flag", "what does". Those are precisely the
three rows above where it loses, because a one-line answer has nothing to cut
and the block costs more than the whole reply.

An earlier run tested only that case, concluded the mode should be dropped,
and was wrong. It was wrong because one question is not a spread.

The triggers now fire on shapes measured to draw long answers, plus anyone
asking for brevity outright.

## Two rules that came out of it

**Terseness is a modifier, not a discipline.** "What is the difference between
these two indexes" is an engineering question that also wants a short answer.
Letting brevity compete for the top slot made it displace the discipline, which
scored as a wrong answer against a corpus whose labels are disciplines.

**An inferred shape may not stand alone.** Firing brevity by itself on a
prompt that wanted engineering converted silence into wrong answers on 3% of
the holdout, and a wrong block is worse than no block. So an explicit request
can stand alone; a guess rides along or waits.

With both rules the holdout is unchanged at 38% served, 58% silent, 4% wrong.
Terseness adds its value without costing accuracy anywhere else.

## What is not measured here

Answer quality. Read `measure.js`: both arms are inline, and six shorter
answers are only a win if they are still answers. On the comparison question
the terse arm dropped a table of five query shapes, which is a real loss if you
wanted the table.
