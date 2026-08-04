# Changelog

Notable changes only. Anything that changes what grain injects, what it stays
quiet about, or what it costs you.

Findings that made grain look worse are here too, because a changelog that only
records wins is marketing.

## 0.17.0

- **Delegation measured, with a correctness arm.** One investigative question
  asked two ways. Reading directly put about 26,400 tokens into the main
  context; delegating to `scout` put about 1,500 there, roughly 94% less. Both
  answers were accurate against the source, but the delegated one found 14 of
  the 25 abstention points rather than all of them. Delegate to orient, read
  directly to audit.
- Documented the agents, the orchestration command and the map detection, none
  of which the README mentioned.

## 0.16.0

- **The engineering block now says to survey wide and read narrow**, meaning
  send a subagent for a sweep across many files rather than reading them into
  the conversation. Adds 75 tokens to that block, on the 17% of prompts that
  route to engineering.
- **grain names an existing code map** when a repository has one, on
  engineering and orchestration turns only. Detects `graft/`, `graphify-out/`
  and `.graph/`. grain does not build an index and is not going to: tools that
  do this properly already exist.
- **Two config keys that could never be set.** `skills: false` and
  `session: false` were read by the hook while `loadConfig` produced neither,
  so both branches were unreachable. Wired up rather than deleted, since they
  turn off the parts of grain that cost tokens unasked.
- The README leads with `grain skills` now. Most people have hundreds of skills
  installed and use a handful.

## 0.15.0

- **Four agents ship with the plugin**: `scout` (sonnet, high effort),
  `builder` and `designer` (opus, medium), `verifier` (opus, high). A prompt
  hook cannot launch anything, so grain ships the agents its own guidance keeps
  telling the model to use.
- **`/grain:orchestrate`** decomposes a request into briefs, picks a tier for
  each, prints the plan with its cost, and waits for approval before
  dispatching.
- **A design skill**, built as an ordered gate list where every item can be
  answered yes or no. Its claim is about process, not taste.
- **Renamed the `grain` skill to `voice`.** The product and one of its skills
  shared a name, and the skill was the writing one, which is why the CLI, the
  skill and the README each described a different tool.
- **380 tokens, down from 528.** Shipping the agents added their descriptions to
  every session. Moving "how this agent works" from the description into the
  body, where it costs nothing until dispatch, gave 148 of that back.

## 0.14.0

- **Cut terse's 21 inferred shape triggers.** `compare`, `why is`, `is it worth`
  and the rest were measured to draw long answers when tested on questions
  written for the purpose. Against 1,738 real prompts they fired four times and
  were wrong four times, because "why is the store not loading" is a bug report.
  `just tell me` went too. What remains is people asking outright, which fired
  zero times in the same corpus and is kept anyway.
- **Cut verification's ambiguous weak words**: `verify`, `verified`, `confirm`,
  `certain`, `sure`. Two of those clear the bar alone, which is how a request to
  hide some Discord channels until documents were signed got a block about
  challenging the agent's own work.

## 0.13.0

- **An opt-in repository fallback.** Set `"fallback": "engineering"` and a
  substantial request that matched nothing gets that discipline. Doubles recall
  from 27% to 54% on a holdout and roughly triples the unwanted blocks, about
  five rescued for every two wasted. Off unless a repository asks for it.
- **A local decision log**, read with `grain stats`. Every turn including the
  silent ones, capped at 500. No prompt text, ever, so it measures coverage and
  can never measure correctness.

## 0.12.0

- **The evidence bar dropped from 3 to 2.** Real prompts carry one weak trigger
  where benchmark prompts carry three. Recall went from 9% to 27% on the half
  the value was chosen on and 15% to 27% on the half it was not, costing three
  points of silence.
- **Removed `minMargin`**, a threshold read from config, range-checked, then
  never consulted. The benchmark had been sweeping it and printing five tuning
  rows that were three distinct behaviours.
- **The published routing figure was wrong.** 51% came from 280 prompts written
  to exercise the router. On 363 prompts taken from real history and labelled
  blind by two independent reviewers, it is 27%. A rule that always answers
  "engineering" scores 80% on the same labels, and that control is now published
  beside it.
