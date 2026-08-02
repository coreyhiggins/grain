'use strict';

const { route } = require('./route');
const { blockFor, approxTokens } = require('./modes');
const { loadConfig } = require('./config');

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

  const decision = route(payload && payload.prompt, config);
  if (!decision) return null;

  // A custom mode carries its own guidance, already framed as project-written
  // text by loadConfig. A built-in mode uses the block we shipped.
  const block = decision.custom
    ? (config.modes[decision.mode] || {}).guidance
    : blockFor(decision.mode);
  if (!block) return null;

  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: block,
    },
  };

  // Debug mode prints what matched and what it cost. Off by default, because
  // a systemMessage on every routed turn is exactly the kind of noise that
  // gets a tool uninstalled.
  if (options.debug) {
    output.systemMessage = `grain: ${decision.mode} (score ${decision.score}, `
      + `~${approxTokens(block)} tokens) via ${decision.signals.join(', ')}`;
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
