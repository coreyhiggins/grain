'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { route } = require('./route');
const { blockFor, approxTokens } = require('./modes');
const { loadConfig } = require('./config');
const { matchSkills, formatSuggestions } = require('./skills');
const session = require('./session');
const pin = require('./pin');

// The UserPromptSubmit hook. This is the router's entry point.
//
// It fires on every prompt you submit, which makes it the highest-leverage
// and highest-risk place in the whole tool. Three rules follow from that:
//
//   1. SILENCE IS THE DEFAULT. If the router is not confident, this returns
//      null and the turn costs nothing. Most conversational turns should hit
//      that path.
//   2. IT NEVER BLOCKS. The event supports `decision: "block"`, which erases
//      the prompt from the queue. grain does not use it. Nothing about a
//      style tool justifies deleting what someone typed.
//   3. IT FAILS OPEN. Any throw is swallowed and the prompt proceeds. The
//      documented timeout here is 30 seconds rather than the usual 600, so
//      there is no room for anything slow, and everything this does is string
//      matching for that reason.

// A repository that has already been mapped should be queried, not re-read.
//
// The most expensive habit in agentic coding is orienting by grep: twenty
// files pulled into the conversation to learn one fact, gone from the budget
// for the rest of the session. Tools exist that solve this properly by
// building the map once and answering from it.
//
// grain does not build one and should not. Its job is knowing when something
// applies, so when a map is already sitting in the repository it says so, on
// the turn where the model is about to go looking. Naming the directory is
// enough: the model knows what to do with a code graph once it knows one is
// there.
//
// Checked cheaply, because this runs on every engineering turn inside a hook
// with a 30 second budget. Directory existence only, no reading, no parsing.
const MAPS = [
  ['graft', 'graft'],
  ['graphify-out', 'graphify'],
  ['.graph', 'a code graph'],
];

function mappedRepo(cwd) {
  for (const [dir, name] of MAPS) {
    try {
      if (fs.statSync(path.join(cwd, dir)).isDirectory()) return { dir, name };
    } catch { /* not there, which is the common case */ }
  }
  return null;
}

// How much someone has to type before the opt-in fallback will speak. Chosen
// on labelled real prompts, not by taste: at 80 characters recall reaches 59%
// but one fire in 3.6 is unwanted; at 120 recall is 54% and one in 4 is. The
// five points were worth the better ratio, since a wrong block costs more than
// a missing one. See the FALLBACK comment in decide() for the full table.
const FALLBACK_MIN_CHARS = 120;

/**
 * Decide what to inject, if anything.
 *
 * Returns the hook's JSON output, or null to stay silent.
 */
function decide(payload, options = {}) {
  const config = options.config !== undefined
    ? options.config
    : loadConfig((payload && payload.cwd) || process.cwd());

  // A user-level off switch beats everything. If somebody turned grain off,
  // it stays off until they turn it back on.
  if (options.pinState !== false && !pin.isEnabled()) return null;

  const prompt = payload && payload.prompt;
  let decision = route(prompt, config);

  // A pinned mode overrides detection. Someone who typed /grain:mode has
  // already told the router it was wrong, so it does not get another vote.
  const forced = options.pinState === false ? null : pin.pinned();
  if (forced && blockFor(forced)) {
    decision = { mode: forced, score: 0, custom: false, pinnedBy: 'user', signals: [], modes: [{ mode: forced, score: 0, custom: false }] };
  }

  // A follow-up carries no signal of its own. If the router found nothing and
  // the prompt reads as a continuation, fall back to the mode the last real
  // signal established. Conditions are tight, see session.js.
  const sessionId = payload && payload.session_id;
  let inheritedMode = null;
  if (config.session !== false) {
    if (decision) {
      session.remember(sessionId, decision.mode, options.now || Date.now());
    } else {
      inheritedMode = session.inherited(sessionId, prompt, options.now || Date.now());
      session.ageOne(sessionId);
      if (inheritedMode) {
        decision = { mode: inheritedMode, score: 0, custom: false, inherited: true, signals: [], modes: [{ mode: inheritedMode, score: 0, custom: false }] };
      }
    }
  }

  // THE FLOOR. Last resort, opt-in, and honest about being a length heuristic.
  //
  // Measured against 363 blind-labelled real prompts, the router gives a right
  // discipline to 27% of the ones that need one. The reason is not the
  // threshold: real requests routinely carry no vocabulary for what they ask.
  // "its still happening" is a bug report with no bug words in it.
  //
  // The same measurement showed that a rule reading only "always say
  // engineering" scores 80%, because two thirds of real prompts in a software
  // repo are code work. That is not shippable on its own, since it also speaks
  // on every "thanks that worked". But as a FLOOR under a length gate, on a
  // repo that opted in, it roughly doubles recall:
  //
  //          recall   fires when unwanted   rescued : wasted
  //   off      27%            9%                  n/a
  //   on       54%           17%                3.0 : 1
  //
  // Holdout figures; the tuning half agreed at 53% and 2.9:1. So five prompts
  // get help for every two that get a block they did not need.
  //
  // WHAT THIS IS. A length heuristic, stated plainly rather than dressed up.
  // Coverage was already correlated with prompt length by accident, which was
  // a defect precisely because it was accidental and unmeasured. This is the
  // same correlation used deliberately, with the cost written down: if you
  // typed 120+ characters in a repo that declared itself, you are probably
  // making a request of the kind it declared.
  //
  // It never overrides. Routing wins, inheritance wins, and it fills what is
  // left. Off unless `"fallback": "engineering"` is in a trusted config.
  if (!decision && config.fallback) {
    const fallbackGuidance = blockFor(config.fallback) || (config.modes[config.fallback] || {}).guidance;
    if (fallbackGuidance && typeof prompt === 'string'
      && prompt.trim().length >= FALLBACK_MIN_CHARS
      && !session.looksLikeFollowUp(prompt)) {
      const custom = !blockFor(config.fallback);
      decision = {
        mode: config.fallback,
        score: 0,
        custom,
        fallback: true,
        signals: [],
        modes: [{ mode: config.fallback, score: 0, custom }],
      };
    }
  }

  // A request is often two disciplines at once, so up to two blocks go in.
  // A custom mode carries its own guidance, already framed as project-written
  // text by loadConfig. A built-in mode uses the block we shipped.
  const guidanceFor = (m) => (m.custom ? (config.modes[m.mode] || {}).guidance : blockFor(m.mode));
  let block = decision
    ? (decision.modes || [decision]).map(guidanceFor).filter(Boolean).join('\n\n')
    : null;

  // Only on the turns that are about to go reading. A prose or design request
  // has no use for this, and a line nobody needs is a line nobody should pay
  // for. The engineering block already says to survey wide and read narrow;
  // this names the thing to survey with.
  if (block && decision.modes.some((m) => m.mode === 'engineering' || m.mode === 'orchestration')) {
    const map = mappedRepo((payload && payload.cwd) || process.cwd());
    if (map) {
      block += `\n\n${map.name} has already mapped this repository, in ${map.dir}/. `
        + 'Query the map before reading files to orient. It was built for this and it answers '
        + 'without spending the conversation.';
    }
  }

  // Skill suggestions are independent of mode: a request can be worth naming a
  // skill for without matching any mode, and vice versa. Both stay silent when
  // they have nothing, which is what keeps a conversational turn free.
  const skills = config.skills === false ? [] : matchSkills(prompt, {
    cwd: (payload && payload.cwd) || process.cwd(),
    skills: options.installedSkills,
  });
  const suggestions = formatSuggestions(skills);

  if (options.pinState !== false) pin.remember(decision);
  if (!block && !suggestions) return null;

  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: [block, suggestions].filter(Boolean).join('\n\n'),
    },
  };

  // Debug mode prints what matched and what it cost. Off by default, because
  // a systemMessage on every routed turn is exactly the kind of noise that
  // gets a tool uninstalled.
  if (options.debug) {
    const parts = [];
    if (inheritedMode) parts.push(`inherited ${inheritedMode}`);
    if (decision && !decision.inherited) parts.push(`${decision.mode} (score ${decision.score}) via ${decision.signals.join(', ')}`);
    if (skills.length) parts.push(`skills: ${skills.map((s) => s.name).join(', ')}`);
    const cost = approxTokens(output.hookSpecificOutput.additionalContext);
    output.systemMessage = `grain: ${parts.join(' | ')} | ~${cost} tokens`;
  }

  return output;
}

function readPayload(stream = process.stdin) {
  return new Promise((resolve) => {
    let raw = '';
    stream.setEncoding('utf8');
    stream.on('data', (c) => { raw += c; });
    stream.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    stream.on('error', () => resolve(null));
  });
}

async function runPromptHook() {
  try {
    const payload = await readPayload();
    if (!payload) return 0;

    const output = decide(payload, { debug: process.env.GRAIN_DEBUG === '1' });
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (err) {
    process.stderr.write(`grain: internal error, continuing (${err.message})\n`);
  }
  return 0;
}

module.exports = { decide, runPromptHook, readPayload };
