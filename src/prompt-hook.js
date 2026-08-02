'use strict';

const { route } = require('./route');
const { blockFor, approxTokens } = require('./modes');
const { loadConfig } = require('./config');
const { matchSkills, formatSuggestions } = require('./skills');
const session = require('./session');

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

/**
 * Decide what to inject, if anything.
 *
 * Returns the hook's JSON output, or null to stay silent.
 */
function decide(payload, options = {}) {
  const config = options.config !== undefined
    ? options.config
    : loadConfig((payload && payload.cwd) || process.cwd());

  const prompt = payload && payload.prompt;
  let decision = route(prompt, config);

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

  // A request is often two disciplines at once, so up to two blocks go in.
  // A custom mode carries its own guidance, already framed as project-written
  // text by loadConfig. A built-in mode uses the block we shipped.
  const guidanceFor = (m) => (m.custom ? (config.modes[m.mode] || {}).guidance : blockFor(m.mode));
  const block = decision
    ? (decision.modes || [decision]).map(guidanceFor).filter(Boolean).join('\n\n')
    : null;

  // Skill suggestions are independent of mode: a request can be worth naming a
  // skill for without matching any mode, and vice versa. Both stay silent when
  // they have nothing, which is what keeps a conversational turn free.
  const skills = config.skills === false ? [] : matchSkills(prompt, {
    cwd: (payload && payload.cwd) || process.cwd(),
    skills: options.installedSkills,
  });
  const suggestions = formatSuggestions(skills);

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
