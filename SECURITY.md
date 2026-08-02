# Security

grain runs inside your agent and writes into your model's context. That is a
position of trust, so this document states exactly what it can reach and what
it deliberately cannot.

## Reporting

Open a private security advisory through GitHub on this repository. If that is
not available to you, open a normal issue saying only that you have found
something and how to reach you, without the details.

## What grain has access to

- The text of prompts you submit, via the `UserPromptSubmit` hook.
- The text of the agent's answers, via the optional `Stop` hook.
- Markdown and text files you point it at, plus `git log`, when building a
  voice profile.
- `.grain.json` in the working directory, and `~/.grain/` in your home
  directory.

## What grain does not do

- **No network.** There are no HTTP calls anywhere in the codebase, no
  telemetry, and no keys. It works with the machine unplugged.
- **No file content leaves the tool.** Findings carry rule names, line numbers,
  and counts. The offending text is never quoted back to the model or written
  anywhere. There are tests pinning this.
- **No writes outside two places.** Hook loop state goes to the system
  temporary directory, and trust records go to `~/.grain/`. grain never writes
  into your project.
- **No prompt is ever blocked.** The `UserPromptSubmit` event supports a
  decision that erases the prompt from the queue. grain does not use it.

## The threat that shaped the design

The serious one is **prompt injection through project configuration**.

A custom mode is a block of text that grain injects into the model's context on
every matching turn. If grain read that text out of the working directory with
no ceremony, then cloning a repository and opening an agent in it would hand
that repository's author a write primitive on your model's instructions. Not
hypothetically. A `.grain.json` sitting in a repo you cloned to review a pull
request would be enough.

"Guidance" and "instructions the model will follow" are the same bytes. No
parser separates them, and filtering for dangerous phrasing is a blocklist
against natural language, which loses.

### The mitigation

grain uses direnv's model, which has held up for this exact shape of problem:

1. A project config is **inert until explicitly approved**. Nothing from it
   reaches the model before that.
2. `grain trust` **prints the file in full** before approving anything. The
   entire point is that a person reads the text.
3. Approval is keyed to the file's **content hash**, not its path. Any edit
   revokes approval until the new version is approved.
4. Approved custom guidance is **framed when injected**, naming `.grain.json`
   as its source and disclaiming grain's authorship, so a block that starts
   issuing orders reads as a project file overstepping rather than as a system
   instruction.
5. Guidance blocks are **capped** at 2,000 characters and 12 modes.

Configuration in `~/.grain/` is trusted without ceremony, because you wrote it.

### What this does not protect against

- A config **you** approved after reading it. Trust means trust.
- Anything the model does with the prompt itself. grain reads prompts, it does
  not sanitise them, and it is not a defence against a hostile prompt.
- Other tools in your agent. grain guards its own configuration surface only.

## Failure behaviour

Every hook fails open. A malformed payload, an unreadable file, or an
unexpected exception ends the turn normally rather than interrupting it. A
style tool must never be the reason a session breaks, and the tests cover the
malformed cases directly.
