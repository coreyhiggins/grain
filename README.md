<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/coreyhiggins/grain@main/assets/routing.svg" alt="Tokens injected per turn. A fixed block costs the same on every turn. grain costs nothing on conversational turns." width="760">
</p>

<p align="center">
  <b>grain</b><br>
  The discipline layer for AI coding.<br>
  Reads what you asked for and brings the right discipline: engineering restraint,
  orchestration, design judgment, or writing voice. Silent on the rest.
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@coreyhiggins/grain?color=2f81f7" alt="npm">
  <img src="https://img.shields.io/badge/tests-115-3fb950" alt="tests">
  <img src="https://img.shields.io/badge/node-%3E%3D18-3fb950" alt="node 18+">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
</p>

<p align="center">
  <a href="#how-many-skills-do-you-have-installed">Skills you forgot</a> &nbsp;·&nbsp;
  <a href="#before--after">Before / After</a> &nbsp;·&nbsp;
  <a href="#install">Install</a> &nbsp;·&nbsp;
  <a href="#modes">Modes</a> &nbsp;·&nbsp;
  <a href="#skill-activation">Skills</a> &nbsp;·&nbsp;
  <a href="#custom-modes">Custom modes</a> &nbsp;·&nbsp;
  <a href="#numbers">Numbers</a> &nbsp;·&nbsp;
  <a href="#what-grain-does-not-do">Limits</a>
</p>

## How many skills do you have installed?

```bash
grain skills
```

On the machine this was written on the answer is **460 skills and 77 agents**.
Almost none of them get used, because nobody remembers what they installed six
weeks ago. They sit there doing nothing.

grain indexes all of them and names the ones that fit, on the turn they fit:

```bash
grain skills "the deploy failed again can we fix the launcher build"
```

```
  3 of 460 skills matched

  deploy  score 13.5, named directly
    on: deploy, build, launcher
```

That runs on every prompt, costs about 89ms, and says nothing when nothing
matches. You can check it against your own machine in less time than it takes
to read this paragraph.

The rest of grain is about what happens next. It brings the right discipline to
the request, and stays quiet when there is no right discipline to bring.

## Why

Your `CLAUDE.md` is not enforcement. Anthropic's own documentation is direct
about this:

> CLAUDE.md content is delivered as a user message after the system prompt, not
> as part of the system prompt itself. Claude reads it and tries to follow it,
> but there's no guarantee of strict compliance.

And about what happens as it grows:

> Longer files consume more context and reduce adherence.

So the file that holds your standards gets less effective the more standards
you put in it. That is the trap.

grain re-states the relevant rules on the turn they apply to, rather than
hoping a long file read at startup is still steering things forty messages
later.

**What grain is not, stated plainly.** The same documentation page recommends
hooks for instructions that must run at a fixed point, saying they "apply
regardless of what Claude decides to do". That sentence is about the hook
**executing**. It is not a promise that Claude obeys the text a hook returns.

An earlier version of this README used that quote to imply grain enforces your
rules. It does not. grain delivers text deterministically; complying with it is
still a judgement the model makes, exactly as with `CLAUDE.md`. What grain
changes is **recency and relevance**, not authority.

If you need something actually enforced, a `PreToolUse` hook that blocks the
action is the mechanism, and grain is not a substitute for it.

## Before / After

Re-stating rules every turn only works if it stays cheap, otherwise you have
rebuilt the problem. A tool that injects a fixed block pays on **every** turn,
including the turns where it has nothing to say.

```
Prompt                                       Fixed block    grain
"yes"                                           ~1000          0
"thanks, that worked"                           ~1000          0
"run it again"                                  ~1000          0
"are you sure?"                                 ~1000        213   verification
"refactor the parser"                           ~1000        249   engineering
"draft the release notes"                       ~1000        217   prose
"review the PR then write the release notes"    ~1000        481   both
```

Across **1,738 prompts taken from real Claude Code history**, grain stayed
silent on 73% and averaged **80 new context tokens per prompt**, or about 290
on the turns where it says anything at all. On the 280-prompt hand-written
corpus in [`bench/`](bench/) the same build is silent on only 39%, which is the
gap between prompts written to exercise a router and prompts people type. Both
harnesses ship, so you can re-run either rather than take it on trust.

**The whole bill, since the number above is only the per-turn half.** Installing
the plugin adds about **380 tokens to every session**, always, for the skill and
agent descriptions the model needs in order to know they exist. Check it
yourself with `claude plugin details grain@grain`. That figure was 528 until
the agent descriptions were rewritten to carry only the dispatch signal, with
everything about *how* each agent works moved into its body, where it costs
nothing until the agent is actually used.

> [!WARNING]
> **grain does not save you tokens, and there is no measurement claiming it
> does.** It is a cost: 380 per session, plus 0 to 290 per turn. The one mode
> that was supposed to shorten output was terse, and terse was cut down to
> explicit requests after firing five times in 1,738 prompts and being wrong
> all five.
>
> An attempt to measure whether the engineering block shortens answers failed
> for an honest reason worth recording: the control arm was contaminated,
> because the environment running it already injects equivalent restraint
> guidance into every subagent. What the run did show, twice, is that stacking
> a second restraint block made the answer roughly **40% longer**, not shorter,
> through added caveats and justification.
>
> The case for grain is that the answer is better, not shorter. That is a
> quality claim, and unlike the routing numbers on this page, it is one nobody
> here has measured.

Read that claim precisely, because the obvious stronger version is wrong.
That figure is the size of the block grain adds, not what a turn costs the
API. Injected text stays in the transcript and is re-read on every later
request, so cumulative occupancy grows even though caching discounts the
re-reads. A single concise `CLAUDE.md` is inserted once and caches more
cleanly than anything injected repeatedly.

The fair comparison is against a block injected on **every** turn, which
accumulates the same way but faster. It is not a claim that grain is cheaper
than writing good instructions once.

Two further things this does not claim. It does not reduce output tokens, and
it does not touch the reasoning budget. Those are the two places this category
has gone net negative on people, so grain stays out of both.

Check any prompt yourself:

```bash
grain route "refactor the parser, it has three copies of the same escape logic"
```

```
engineering  score 9, about 249 tokens injected
runner up: prose at 1
matched: refactor, parser, function, extract
```

## Install

```bash
/plugin marketplace add coreyhiggins/grain
```

```bash
/plugin install grain
```

Or as a CLI for any agent that can run a shell command:

```bash
npm install -g @coreyhiggins/grain
```

<details>
<summary><strong>Codex CLI</strong></summary>

Codex has its own `UserPromptSubmit` hook that takes the same
`hookSpecificOutput.additionalContext` shape, so `grain prompt-hook` works
without changes. Add to `~/.codex/hooks.json`, or `.codex/hooks.json` in a
trusted project:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "grain prompt-hook", "timeout": 5, "additionalContextLimit": 800 }
        ]
      }
    ]
  }
}
```

Four differences from Claude Code that are worth knowing:

- Codex reads skills from `.agents/skills` and `~/.agents/skills`, not
  `~/.claude/skills`. `grain skills` currently looks in the Claude locations
  only, so skill suggestions will find nothing on a Codex-only machine.
- Only `type: "command"` hooks run. Prompt and agent handlers are parsed and
  skipped.
- Project hooks do nothing until the project is trusted, and a command hook
  must be reviewed through `/hooks` before it runs.
- Codex plugins use `.codex-plugin/plugin.json`, so this repo's Claude plugin
  manifest does not install there. Configure the hook by hand.

**Untested.** This follows the documented contract and the JSON shapes match,
but no Codex session has been run end to end. Treat it as a starting point and
open an issue if it misbehaves.

</details>

### Staying up to date

Claude Code can update marketplaces and their installed plugins in the
background, but **third-party marketplaces have that switched off by default**,
so a fresh install of grain stays on the version you installed until you say
otherwise. Turn it on once:

```
/plugin  ->  Marketplaces  ->  grain  ->  Enable auto-update
```

Updates land after startup with a delay of up to ten minutes, and the running
session keeps the version it launched with. You get a prompt to run
`/reload-plugins`, or the new version loads next launch.

To update once without enabling anything:

```bash
claude plugin update grain@grain
```

To check what is actually installed and whether it loaded:

```bash
grain doctor
```

```
grain doctor  cli 0.11.0

ok    plugin 0.11.0
      matches the marketplace copy
ok    536 skills and agents indexed
      459 skills, 77 agents
note  8 old version(s) left in the cache
```

This exists because grain shipped seven versions whose manifest made the whole
plugin fail to load, while `claude plugin validate --strict` passed every
time. The only place the truth appeared was `claude plugin list`. `doctor`
reports what is true on disk and makes **no network calls**, so version drift
is found by comparing the copies already on your machine.

Every grain release bumps the `version` field, which is what makes an update
visible to you at all. A plugin that never bumps it never appears to change.

## Modes

| Mode | Fires on | Injects |
|---|---|---|
| `engineering` | code, bugs, refactors, tests, migrations | Read before you edit. Reuse what exists. No speculative abstraction. Root-cause fixes. |
| `orchestration` | planning, delegation, subagents, specs | Spec first, then briefs that stand alone. Route by difficulty. One repo, one agent. Verify with your own eyes. |
| `prose` | READMEs, changelogs, posts, commit messages | Hold one register. Vary the rhythm. Cut filler. Hedge once. |
| `design` | layout, palette, typography, dark mode | Pick a scale and hold it. Limit the palette. Earn the hierarchy. Check contrast. |
| `verification` | "are you sure", "did you actually run it" | Answer from evidence. Say which claim you are making. Re-read the file. If you cannot verify it, say so. |
| custom | whatever you define | Your own guidance, see below. |

`verification` exists because two labellers, working blind and independently,
both reported the same hole in the other four. Prompts like "did you actually
run it or are you guessing" fit none of them, and one labeller noted these
matter more than they look, because they are exactly where an assistant
bluffs. It is also the one mode allowed to fire on a very short prompt: "are
you sure" is thirteen characters and is precisely the moment to say so.

The orchestration block talks about **roles**, never model names: orchestrator,
hard tier, workhorse, scout. Naming models guarantees the advice rots, because
a copy of grain from three months ago would confidently recommend a model that
has been superseded. Roles do not change when the lineup does. There is a test
that fails if a model name appears in a shipped block.

Those roles are **not configurable**. Version 0.2.0 claimed they were, in both
the source comment and this file. That was false, and nothing in the config
loader ever read a `tiers` key.

Routing is plain string matching. No model call, no network, and no latency
worth measuring. When the signal is weak grain injects nothing at all. When a
second discipline scores at least half the first, both blocks go in, capped at
two, because three is most of a fixed block and defeats the point.


<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/coreyhiggins/grain@main/assets/disciplines.svg" alt="A prompt arrives, grain scores it once, then either names one or two disciplines and injects that guidance, or stays silent and adds zero tokens, which is what happens on 73% of real prompts." width="760">
</p>

### How well it actually routes


<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/coreyhiggins/grain@main/assets/measured.svg" alt="grain routing accuracy measured on two corpora: 51% on 280 prompts written to test the router, 27% on 363 prompts people actually typed, and 80% for a control that always answers engineering." width="760">
</p>

**On real prompts, badly.** Every earlier version of this section reported
numbers from prompts written to exercise the router, and those numbers were
roughly twice what the tool delivers in use. The honest figures come from 363
prompts taken out of real Claude Code history and labelled blind by two
independent reviewers who were never shown the trigger lists:

| | gives a right discipline | stays silent when it should |
|---|---|---|
| tuning half | 27% | 94% |
| **holdout, never tuned on** | **27%** | **91%** |

Both halves agree, which is the encouraging part. Engineering precision is
0.87, so when grain does name a discipline it is usually right. The problem is
entirely recall.

<details>
<summary>The cheap control that beats it, and why it is still not the answer</summary>

About two thirds of real prompts are engineering work. So the rule **"always
say engineering"** scores 80% against these labels, three times grain's recall,
while understanding nothing whatsoever.

It is not a serious proposal, because it also speaks on 100% of the prompts
that wanted silence, and a wrong block costs tokens *and* aims the model at the
wrong discipline. It is published because a benchmark with no cheap control is
decoration, and this control says plainly that grain's recall is worse than a
constant.

</details>

**Where the old numbers came from.** The hand-written 280-prompt corpus fires
on 48% of its own prompts. Real prompts fire at 13%. A sentence composed to
test a mode names that mode several times over, so it clears any threshold; a
sentence somebody types carries one hint and stops. A later 2,000-prompt
generated corpus fired at 14.8%, within two points of reality, and was still
discarded once a blind reviewer found that every label had its own sentence
template.

> [!WARNING]
> **Silence is still the main defect, and most of it will not yield to tuning.**
> Lowering the evidence bar from 3 to 2 took recall from 9% to 27% and cost 3
> points of silence, which was worth it. Going to 1 reaches 55% by speaking on a
> third of the prompts that wanted nothing, which is not.
>
> The rest is not a threshold problem. Real requests routinely carry no
> vocabulary at all for the thing they are asking about:
>
> - `its still happening` and `the store is still not loading` are bug reports
>   with no bug words in them.
> - `it kind of just appears` and `looks squashed still` are design feedback
>   with no design words in them.
> - `didnt we have a cloak creator` challenges earlier work, phrased as a
>   memory question.
>
> String matching cannot reach these and no word list will. Anyone claiming a
> keyword router handles natural requests has not measured it against real ones.

<details>
<summary>Which modes actually earn their keep</summary>

Sampled from grain's own fires, labelled blind, 165 prompts. Precision, not
recall: **when this mode fires, is it right, and would plain engineering have
been just as right?** A mode that only fires where engineering also applies
costs vocabulary and buys nothing the repo fallback does not already give you.

| mode | fires (of 1,738) | in gold | was the primary need | genuinely not engineering |
|---|---|---|---|---|
| engineering | 301 | 88% | 73% | n/a |
| prose | 52 | 76% | 52% | 19 of 32 correct fires |
| orchestration | 87 | 63% | 51% | 14 of 27 |
| design | 77 | 70% | 47% | **2 of 30** |
| verification | 6 | 67% | 50% | 2 of 4 |
| terse | 5 | **0%** | 0% | none correct |

**terse was cut** on this evidence, above. **design survived but barely earns
its own name**: it is 70% right and 93% of its fires also need engineering, so
it is nearly always a second opinion rather than the answer. It stays because
the guidance it injects differs from engineering's, not because it identifies
a distinct kind of request.

Two caveats that matter more than the table. The labeller noted **prose is
nearly collinear with the literal words** `announcement`, `changelog`, `readme`,
because this particular user always names the artifact; expect that 76% to fall
for someone who writes "write something for the players". And engineering is
75% of the sample, so its precision is close to what firing it on everything
would score.

</details>

**Reproduce this on your own history.** `node bench/extract-real.cjs <outfile>`
reads your local transcripts, drops anything carrying a secret, a path, a host
or an email, drops long pastes whole, and keeps only prompts you typed. It
refuses to write inside this repository and its output is gitignored. None of
the prompts behind the table above are published, only the numbers.

The prompt hook never blocks a prompt, even though the event permits it.
Nothing about a style tool justifies deleting what somebody typed.

### Follow-up turns

"yeah do it" has no discipline in its own text. That is not a gap in the
prompt, it is how conversations work, and the router only sees one turn.

So a follow-up inherits the mode the last real signal established. The bounds
are tight, because inheritance is a guess about a turn grain cannot see:

- only when the router itself found nothing, so a real signal always wins
- only when the prompt reads as a continuation, by length or by an opener that
  points backwards. "fix the login page" is short and complete, not a follow-up
- at most three turns, and at most ten minutes
- never `verification`, since "are you sure" is about the answer just given and
  carrying it forward would keep second-guessing turns later

Measured over 60 written conversations, 148 follow-up turns:

| | follow-ups served |
|---|---|
| without inheritance | 17 (11%) |
| with inheritance | **53 (36%)** |

The risk worth measuring is a stale mode surviving a change of subject. Across
the conversations written to change topic partway, that happened **once**.

> [!IMPORTANT]
> **That 36% does not survive contact with real sessions.** Replaying 2,668
> prompts from real Claude Code history in transcript order, inheritance
> rescued **2.7%** of all turns. 686 prompts looked like follow-ups and only 73
> of them found a live mode to inherit.
>
> The reason is structural rather than a bug. Inheritance can only carry a mode
> the router already produced, and on real prompts the router is silent 73% of
> the time, so the preceding turn usually has nothing to pass on. Inheritance
> *multiplies* coverage instead of adding to it, which means it compounds the
> recall problem rather than offsetting it. Written conversations hid this,
> because in those the first turn almost always routed.
>
> It is kept because it remains cheap and accurate: on the labelled real
> prompts it added 5 right answers, 0 wrong, and 3 blocks on turns that wanted
> nothing.

```bash
node bench/followups.js
```

The corpus has a weakness its author flagged and I am repeating rather than
burying: about half its topic-shift conversations pivot the same way, from code
to a written artifact. The leak count is a floor, not a full picture.

## Skill activation

A skill's body loads when Claude judges it relevant to your prompt. That
judgement misses, often enough that people have written the failure up
repeatedly and hand-rolled the same fix at least three separate times.

grain matches your prompt against the descriptions of every skill **and agent**
you have installed, including the ones inside other plugins, and names up to
three that look relevant. It does not load them, and it does not tell Claude
to. A wrong suggestion is then something the model ignores rather than
something that derails a turn.

Widening that search from 32 items to 536 broke it at first. "design" appears
in dozens of descriptions, so a design request matched a marketing plugin and a
web scraper ahead of the actual design tool. Words are now weighted by how rare
they are across all the descriptions, which is inverse document frequency and
the standard answer to the standard problem. A suggestion also needs two
distinct matches, or the thing named outright, because one word is a
coincidence.

Scanning 536 files on every prompt would be slow, so the index is cached and
rebuilt only when a directory changes. Cold 54ms, warm 4ms.

```bash
grain skills "deploy the new build to the live server"
```

```
2 of 32 skills matched

deploy  score 7, named directly
  on: deploy, server
runbooks  score 2
  on: deploy
```

Run it with no argument to list every skill alongside the description grain
matches against. That is the fastest way to find out why your own skill never
fires, which is usually that its description contains no word anyone would
actually type.

Two bugs found building this, both worth knowing if you write skills. A
`description: >` block scalar puts the real text on the indented lines below,
so a naive parser reads only the `>`. And CRLF line endings break frontmatter
regexes outright, because `.` in a JavaScript regex does not match `\r`. Both
failures are silent: the skill simply stops matching anything, with no error.

## When it gets it wrong

Auto-detection is the default and needs no setup. It is also wrong sometimes,
and a router you cannot correct is a router you argue with.

```
/grain:why              what the last turn matched, and why
/grain:mode design      force a mode, ignore detection
/grain:mode auto        go back to detecting
/grain:off              inject nothing at all
/grain:off on           back on
```

The same controls exist on the CLI as `grain why`, `grain pin <mode>`,
`grain unpin`, `grain off` and `grain on`.

`why` is the important one. A tool that quietly edits the context of every
prompt owes you an answer to "what did you just do to that", and this is it:

```
last turn: engineering
score 5 via refactor, parser, extract
```

It records the mode, the matched words and the cost, and **never the prompt
itself**, so the state file stays safe to read. There is a test asserting that
prompt text does not leak into it.

A pin persists across sessions until you undo it. Somebody who pinned a mode
was correcting a wrong guess, and having that quietly expire would repeat the
mistake.

## Custom modes

A project can define its own mode in `.grain.json`:

```json
{
  "modes": {
    "ops": {
      "strong": ["deploy", "rollback", "incident"],
      "weak": ["runbook", "oncall"],
      "guidance": "Check the runbook before touching production. Announce before you restart anything with users on it."
    }
  }
}
```

### Routing on your own layout

Words are not the only evidence. A prompt that names `styles/theme.css` is a
design request whatever verb it uses, and one that names `src/auth.js` is not.
grain reads the paths in what you typed and folds them into the same decision.

Built in: stylesheet extensions suggest design, markdown suggests prose, code
extensions suggest engineering. Weighted low on purpose, so "rewrite the docs
in `src/api`" still lands on prose rather than being dragged to engineering by
the directory name.

Your own layout is better than any extension list, so map it:

```json
{
  "paths": {
    "renderer/**": ["design"],
    "docs/**": ["prose"],
    "**/*.test.ts": ["engineering"],
    "infra/**": ["orchestration"]
  }
}
```

Values are **mode names only**. This half of the config cannot carry text into
your model's context, which is why it needs no framing, and there is a test
proving a string that is not a mode name gets dropped.

**How this differs from `.claude/rules` with `paths:`.** Those load a rule when
Claude *reads* a matching file, which is after it has decided what to do. This
reads the paths in what you *typed*, before any tool runs. If the first-party
version covers your case, use it. It is free and ships with the product.

Honest scale: adding this moved coverage on the hand-written holdout from 36%
to 38%. Only four of 57 training misses mentioned a path at all. It is a
correction, not a breakthrough, and the configurable half is worth more than
the built-in guess.

**A project config does nothing until you approve it.**

That is not friction for its own sake. A custom mode is text that gets injected
into your model's context, so a config read straight out of the working
directory would mean cloning a repository hands its author a write primitive on
your model's instructions. A file called `.grain.json` in a repo you cloned to
review a pull request is enough.

So grain borrows direnv's model:

```bash
grain trust
```

It prints the file in full, because the entire point is that a person reads the
text before it reaches their model. Approval is tied to the file's **contents**,
so any edit revokes it until you approve the new version. Custom guidance is
also labelled as project-written when injected, rather than passed off as a
system instruction.

### A fallback for repos that know what they are

Grain gives a right discipline to 27% of real prompts, and most of the rest is
not reachable by matching words. If your repo is one where substantial requests
are nearly always the same kind of work, you can say so:

```json
{ "fallback": "engineering" }
```

Now when nothing else matches and you have typed at least 120 characters that
do not read as a continuation, that discipline goes in. It never overrides:
real detection wins, inheritance wins, and this fills what is left.

| | gives a right discipline | fires when unwanted |
|---|---|---|
| off (default) | 27% | 9% |
| on | **54%** | 17% |

Holdout figures against blind-labelled real prompts; the tuning half agreed at
53%. **Roughly five prompts get help for every two that get a block they did
not need.** That is a worse ratio than grain's default behaviour and it is the
whole trade: you are buying recall with precision.

> [!NOTE]
> **This is a length heuristic and it is not pretending otherwise.** Grain's
> coverage was already correlated with prompt length by accident, which was a
> defect precisely because it was accidental. This is the same correlation used
> deliberately, with the cost written down. Setting `fallback` is a claim about
> your repository: that long requests here are usually one kind of work. That is
> true of most application repos and false of a docs site, which is why grain
> will not guess it for you. Off unless you ask.

### What grain knows about itself

```bash
grain stats
```

Every turn goes into a local ring buffer of the last 500 decisions: which modes
fired, what matched, whether it was inherited or came from the fallback, and
**the turns where grain said nothing**, which are the important half.

This exists because grain published a coverage figure of 51% for most of its
life while managing 13% on prompts people type, and nobody could tell, because
the tool kept no record of its own behaviour. It knew what it did on the last
turn and nothing before that.

It stores **no prompt text**, which is the deliberate limit: this measures
coverage and can never measure correctness. Knowing whether a mode was the
*right* one needs the words, and the words are not grain's to keep.

## Numbers

**Measured: token cost per turn.** Arithmetic over the injected block. Check it
with `grain route`.

**Measured, and found wanting: the prose detector.** grain carries an
**experimental** check that reads the agent's answer and looks for markers of
machine-written prose. It is **not enabled by default**. Four corpora, each
with a holdout split the threshold never saw, cheap controls, and bootstrapped
intervals:

| Corpus | Machine side | grain F1 | Best control | Margin |
|---|---|---|---|---|
| Chat answers, clean subset | ChatGPT 2022 | **0.88** | 0.69 | +0.19 |
| Chat answers, full | ChatGPT 2022 | 0.75 | 0.70 | +0.05 |
| Technical documentation | Claude Opus 5 | 0.43 | 0.70 | -0.27 |
| Chat answers, same questions | Claude Opus 5 | **0.25** | 0.69 | **-0.44** |

> [!IMPORTANT]
> **Honest number warning.** Read the middle column. The detector beats its
> controls against 2022-era ChatGPT and loses badly against a current model, in
> both genres. On the paired test, where a human and Claude Opus 5 answered the
> same 21 questions, grain scored 0.25 against 0.69 for a predictor with no
> logic in it.
>
> The reason is visible in the per-rule numbers: Opus 5 produced **zero** stock
> phrases across 9,130 words. The phrase and punctuation lists are calibrated on
> how models wrote in 2023, and current ones have moved. That includes the em
> dash rule most people consider definitive, which ran backwards on every
> corpus tested.
>
> **The detector is experimental and not registered for exactly this reason.**
> The router is unaffected: its claim is arithmetic, not a model of how any
> particular generation writes.

<details>
<summary>Turning the experimental detector on anyway</summary>

The CLI works without any setup:

```bash
grain check draft.md
```

To have it read the agent's answers, add a `Stop` hook to your own settings.
It is deliberately not in the plugin's `hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "grain hook" } ] }
    ]
  }
}
```

It asks for at most one revision per prompt, then goes quiet whatever the
second attempt looks like. Understand that you are enabling something measured
at 0.25 F1 against a current model.
</details>

<details>
<summary>The replacement features, and why four of five were rejected</summary>

Rather than tune the existing rules, the corpus was mined for features that
actually separate a human from Claude Opus 5 on the same question. Five looked
strong, and one looked perfect. Not one of the 21 machine answers used a
first-person pronoun more than its human pair.

Then the same features were measured against human technical documentation:

| Bucket | first person | contractions | parentheses |
|---|---|---|---|
| Human, forum answers | 7.31 | 16.80 | 8.52 |
| Human, technical docs | **0.00** | 8.55 | 9.52 |
| Human, 19th century fiction | 42.04 | 5.21 | 1.30 |
| Machine, ChatGPT 2022 | 0.00 | 7.30 | 2.36 |
| Machine, Opus 5 chat | 0.44 | 2.08 | 0.44 |
| Machine, Opus 5 docs | 0.00 | 1.85 | 11.15 |

Human technical documentation uses first person at **exactly the same rate as a
machine: zero**. A detector built on that feature would flag every README ever
written. Parentheses point one way in chat and the other way in documentation.
Both measure register, not authorship.

Only contraction rate survives. Every human bucket sits between 5.21 and
16.80, every current-model bucket between 1.85 and 2.08. It is one feature, on
a small corpus, and it is not enough to rebuild a detector on.

**The rebuild is abandoned, not pending.** Doing it properly needs clean modern
machine prose from outside the environment that generated this repository, and
every attempt to source it risked the exact contamination that already produced
two false results here: a dash rule that came out backwards, and a pronoun
feature with 21 out of 21 separation that turned out to be measuring register.
`grain check` stays shipped, stays experimental, and stays unregistered.

The lesson worth keeping: a feature with perfect separation on the test set was
wrong, and only checking it against a third bucket revealed that.
</details>

**Not measured at all:** whether the engineering block produces better code, or
the design block better interfaces. Those are real claims with no number behind
them, and they are the reason the prose detector was benchmarked first.

The harness is in [`bench/`](bench/README.md). It exits non-zero when grain
fails to beat its own controls, which is how the negative row above was found.

## Terseness, and the measurement that reversed it

caveman's claim is shorter output. grain competes on it, but only where it
pays. Six question shapes, each asked twice against the same model in separate
threads, one question per turn:

| shape | output saved | net after the 143-token block |
|---|---|---|
| one-line factual | 50 | **-93** |
| yes/no with caveat | 89 | **-54** |
| procedural how-to | 85 | **-58** |
| comparison | 275 | **+132** |
| diagnostic why | 417 | **+274** |
| recommendation | 232 | **+89** |

Average net is **+48 tokens at raw parity**, and break-even sits at 0.75x
against providers charging 3x to 5x more for output than input.

The first version fired on questions that *look* short: "syntax for", "which
flag", "what does". Those are exactly the three rows where it loses, because a
one-line answer has nothing to cut and the block costs more than the whole
reply. An earlier run tested only that case, concluded the mode should be
dropped, and was wrong, because one question is not a spread.

Two rules came out of it. **Terseness is a modifier, not a discipline**, so it
rides alongside engineering rather than displacing it. And **an inferred shape
may not stand alone**, because firing brevity by itself on a prompt that wanted
engineering turned silence into wrong answers on 3% of the holdout. Asking for
brevity outright still stands alone, since that is a stated preference rather
than a guess.

With both rules the hand-written holdout is unchanged at 38% served, 58%
silent, 4% wrong. Terseness adds its value without costing accuracy anywhere
else.

> [!WARNING]
> **Then it was measured on real prompts, and the inferred half was cut.**
>
> The table above is real, and it was taken on questions written to test the
> idea, one per turn. Across 1,738 prompts from actual use, the shape triggers
> fired **four times and were wrong four times**. "Why is the store still not
> loading" has the surface of a diagnostic-why question and is a bug report.
> The saving only exists if the question was a question.
>
> `just tell me` went too. It matched once, on "just tell me what i need and
> where to get it", which asks for specifics rather than for brevity.
>
> Five fires in 1,738 prompts, none of them right. What is left is the half
> where somebody says what they want: `tldr`, `briefly`, `be concise`. That
> half fired **zero** times in the same corpus and is kept anyway, because one
> user who never types "tldr" is not evidence that "tldr" means nothing.
>
> The lesson is the same one as the prose detector. A measurement taken on
> material written to exercise the feature tells you the feature works on that
> material.

```bash
npm run bench:terse
```

Both arms of all six questions are committed in [`bench/terse/`](bench/terse/).
Answer quality is not measured: on the comparison question the terse arm
dropped a table of five query shapes, which is a real loss if you wanted the
table.

## What Claude Code already gives you

Worth knowing before you install anything, because some of this may be all you
need.

| Mechanism | What it does | Where grain differs |
|---|---|---|
| [`.claude/rules/` with `paths:`](https://code.claude.com/docs/en/memory) | Loads a rule file only when Claude touches matching files | Routes on **file path**, not on what you asked for. Nothing loads until a matching file is read. |
| [Skills](https://code.claude.com/docs/en/skills) | Body loads only when Claude judges it relevant | The model decides, so it is not predictable and not inspectable. grain decides by string match, and `grain route` shows you the answer in advance. |
| [`hookify`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/hookify) | Official plugin: regex rules on `UserPromptSubmit` | Same event, same primitive. hookify warns and blocks; grain injects guidance. If you want to stop a behavior, use hookify. |

If path-scoped rules cover your case, use them. They are first-party and free.
grain is for the rules that depend on **what you asked for** rather than which
file got opened, and for wanting to know in advance what will fire.

## What grain does not do

- **It does not score you.** No number, deliberately. A score invites arguing
  with the number instead of looking at the line.
- **It does not judge quality.** Prose can be free of every marker here and
  still be bad writing.
- **It does not read your code.** Only markdown and text. Fenced blocks,
  tables, headings, and config lines are stripped before anything is counted.
- **It does not send anything anywhere.** No network calls, no telemetry, no
  keys. It never quotes file content back to the model, only rule names, line
  numbers, and counts. Tests pin that.
- **It does not block your session.** The optional Stop hook asks for at most
  one revision per prompt, then goes quiet whatever the second attempt looks
  like.

## Rules get cut when they are wrong

A tricolon detector used to live in `src/tells.js`. It flagged "Works with
Claude Code, Cursor, and Codex CLI" as a rhetorical rule of three. Three of its
first four findings on real prose were wrong, so it was removed rather than
tuned, and the reason is still in the source where the code used to be.

A detector that is wrong most of the time is worse than a missing one. It
teaches people to dismiss the output, and then the accurate findings go unread.

If a rule fires on your writing and it is wrong, that is a bug worth an issue.

## Status

Early. Version 0.1.0, 59 tests. The router is on by default. The prose check is
experimental and unregistered, because it was measured against four corpora and
does not work against current models. See Numbers.

Verified on Claude Code. The CLI works with any agent that can run a shell
command, and `grain hook` implements the Stop-hook contract for any host that
provides one, though no other host has been tested end to end.

## License

MIT
