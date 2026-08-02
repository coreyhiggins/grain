<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/coreyhiggins/grain@main/assets/routing.svg" alt="Tokens injected per turn. A fixed block costs the same on every turn. grain costs nothing on conversational turns." width="760">
</p>

<p align="center">
  <b>grain</b><br>
  Reads what you asked for, injects only the guidance that matches, and stays silent otherwise.
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@coreyhiggins/grain?color=2f81f7" alt="npm">
  <img src="https://img.shields.io/badge/tests-74-3fb950" alt="tests">
  <img src="https://img.shields.io/badge/node-%3E%3D18-3fb950" alt="node 18+">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
</p>

<p align="center">
  <a href="#before--after">Before / After</a> &nbsp;·&nbsp;
  <a href="#install">Install</a> &nbsp;·&nbsp;
  <a href="#modes">Modes</a> &nbsp;·&nbsp;
  <a href="#skill-activation">Skills</a> &nbsp;·&nbsp;
  <a href="#custom-modes">Custom modes</a> &nbsp;·&nbsp;
  <a href="#numbers">Numbers</a> &nbsp;·&nbsp;
  <a href="#what-grain-does-not-do">Limits</a>
</p>

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
Prompt                          Fixed block      grain
"yes"                              ~1000            0
"thanks, that worked"              ~1000            0
"what did that do?"                ~1000            0
"redesign the orders schema"       ~1000            0    two modes tied, abstains
"refactor the parser"              ~1000          249    engineering
"draft the release notes"          ~1000          217    prose
```

Over nineteen real prompts, grain **emitted an average of 132 new context
tokens per prompt**, and nothing at all on eight of them.

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

## Modes

| Mode | Fires on | Injects |
|---|---|---|
| `engineering` | code, bugs, refactors, tests, migrations | Read before you edit. Reuse what exists. No speculative abstraction. Root-cause fixes. |
| `orchestration` | planning, delegation, subagents, specs | Spec first, then briefs that stand alone. Route by difficulty. One repo, one agent. Verify with your own eyes. |
| `prose` | READMEs, changelogs, posts, commit messages | Hold one register. Vary the rhythm. Cut filler. Hedge once. |
| `design` | layout, palette, typography, dark mode | Pick a scale and hold it. Limit the palette. Earn the hierarchy. Check contrast. |
| custom | whatever you define | Your own guidance, see below. |

The orchestration block talks about **roles**, never model names: orchestrator,
hard tier, workhorse, scout. Naming models guarantees the advice rots, because
a copy of grain from three months ago would confidently recommend a model that
has been superseded. Roles do not change when the lineup does. There is a test
that fails if a model name appears in a shipped block.

Those roles are **not configurable**. Version 0.2.0 claimed they were, in both
the source comment and this file. That was false, and nothing in the config
loader ever read a `tiers` key.

Routing is plain string matching. No model call, no network, and no latency
worth measuring. When the signal is weak, or when two modes are within two
points of each other, grain injects nothing at all.

> [!WARNING]
> **The router abstains more than it should, and this is the main known
> defect.** Each prompt gets at most one mode, so a request spanning two
> disciplines ties and gets nothing. An outside review found these everyday
> prompts all produce silence:
>
> ```
> "Review this pull request for security, then write release notes"
> "Implement the responsive layout and document the component API"
> "Make it responsive and fix the crash"
> "Do it, then add tests"
> ```
>
> The last one fails for a second reason: the router sees only the current
> prompt, so short follow-ups lose the mode they belong to. Single-label
> classification is the wrong shape for work that is usually two things at
> once. Multi-label routing is the fix, and it is being built against a
> labelled corpus rather than by loosening the thresholds, because turning
> abstentions into confidently wrong injections would be worse.

The prompt hook never blocks a prompt, even though the event permits it.
Nothing about a style tool justifies deleting what somebody typed.

## Skill activation

A skill's body loads when Claude judges it relevant to your prompt. That
judgement misses, often enough that people have written the failure up
repeatedly and hand-rolled the same fix at least three separate times.

grain matches your prompt against the descriptions of every skill you have
installed and names up to three that look relevant. It does not load them, and
it does not tell Claude to. A wrong suggestion is then something the model
ignores rather than something that derails a turn.

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
strong, one of them perfectly: not one of the 21 machine answers used a
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

Only contraction rate survives: every human bucket sits between 5.21 and 16.80,
every current-model bucket between 1.85 and 2.08. It is one feature, on a small
corpus, and it is not enough to rebuild a detector on yet.

The lesson worth keeping: a feature with perfect separation on the test set was
wrong, and only checking it against a third bucket revealed that.
</details>

**Not measured at all:** whether the engineering block produces better code, or
the design block better interfaces. Those are real claims with no number behind
them, and they are the reason the prose detector was benchmarked first.

The harness is in [`bench/`](bench/README.md). It exits non-zero when grain
fails to beat its own controls, which is how the negative row above was found.

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
