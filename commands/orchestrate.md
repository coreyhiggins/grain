---
description: Decompose a request into briefs, pick a tier for each, show the plan and its cost, then dispatch on approval
argument-hint: "<what you want built, investigated, or planned>"
---

The user wants this done: **$ARGUMENTS**

Your job is decomposition, dispatch and integration. It is not typing. If you
find yourself doing work a brief could have carried, you have skipped the point
of this command.

## 1. Understand before you decompose

Read enough of the actual code to know what the work touches. A plan built on a
guess produces briefs built on the same guess, and the agents cannot tell,
because they arrive with none of your context.

If the request is genuinely ambiguous in a way that changes the work, ask now.
One question, then proceed. Do not ask about things you can settle by reading.

## 2. Write the briefs

Split into pieces that can be judged independently. Every brief carries all of:

- **The goal**, and how anyone would know it was met
- **Exact paths.** Absolute, not "the config file"
- **A file to mirror** for idiom, so the result matches the codebase
- **The guardrails.** What not to touch, what not to simplify away
- **The verification** the agent must run, with the command
- **The report shape** you want back
- **"Do not dispatch other agents."** Workers never sub-delegate

A brief that assumes context the agent does not have produces confident wrong
work. That is the single most common failure of this pattern.

## 3. Pick a tier per brief

Route by difficulty, not by habit. The point is the best result per token, not
the cheapest possible run.

| The work is | Send it to |
|---|---|
| Search, inventory, tracing callers, "does this exist" | `scout` |
| Bounded implementation against a decided shape | `builder` |
| Interface work, visual or interaction judgment | `designer` |
| A claim about to be reported done, published, or acted on | `verifier` |

Escalate rather than retry cheap: a brief that fails its own checklist twice
goes up a tier, never to a third cheap attempt. Anything touching security,
money, concurrency, or data loss starts at `verifier`-grade attention and gets
no cheap trial run.

The user may name a model or effort in their request. Honour it, and say what
you changed from the defaults.

## 4. Show the plan, then wait

Print this before launching anything:

```
  brief                          agent      what it costs you
  1. map every caller of X       scout      cheap, read-only
  2. implement the guard         builder    the expensive one
  3. refute the fix              verifier   the expensive one

  3 agents, 2 of them at the top tier. Run it?
```

Then use AskUserQuestion to confirm. **Dispatch nothing until they say go.**
Somebody discovering after the fact that a vague request fanned out into a
dozen top-tier agents is how this command gets uninstalled.

If a brief could be done inline in less time than dispatching it takes, say so
and do it inline. Not everything deserves an agent.

## 5. Dispatch

Send independent briefs in **one message** so they run at once. Serialize
anything that shares mutable state, and never run two agents against the same
repository if either one might run git: HEAD is per worktree, and the second
agent moves the first one's commit onto the wrong branch.

## 6. Integrate, and verify with your own eyes

An agent's report is a claim, not a verification. Before you tell the user
anything is done:

- Read the diff yourself
- Run the tests yourself and look at the real output
- Check that the thing the user asked for is actually what got built

Whoever verifies must be at least the tier that built it. If a top-tier agent
wrote it, a cheap skim is not a check.

Report what was done, what each agent actually changed, and anything left
undone or assumed. If something failed, say so and show the output. Do not
report success you did not confirm.
