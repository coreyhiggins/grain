'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { analyze } = require('./analyze');

// The Stop hook. EXPERIMENTAL, and not registered by default.
//
// It reads what the agent just wrote, before you do. If the text carries
// tells, the findings go back to the model as a blocking reason, so it
// revises and you only ever see the second version. When the text is clean it
// says nothing at all.
//
// WHY IT IS NOT ON.
//
// It was benchmarked against four corpora and it does not work against current
// models. Paired test, human and Claude Opus 5 answering the same 21 questions:
// grain scored 0.25 F1 against 0.69 for a predictor with no logic in it. Opus 5
// produced zero stock phrases across 9,130 words. The rules are calibrated on
// how models wrote in 2023.
//
// It beats its controls against 2022-era ChatGPT, which is a real result about
// a model nobody uses any more. The code stays because it is the subject of the
// benchmark and because the measurement is worth reproducing. It is off because
// shipping a feature we have measured and found wanting would be the same
// overclaiming this project exists to avoid.
//
// See bench/README.md for the numbers and README.md for how to turn it on.
//
// THE LOOP PROBLEM, which is the whole risk of this event.
//
// `decision: "block"` makes Claude keep working. If we blocked every time we
// found something, and the revision also tripped a rule, we would block
// forever and the session would never end. There is no `stop_hook_active`
// field to lean on, so the guard is ours to build.
//
// The guard: block at most ONCE per prompt_id. One revision pass, then we are
// silent no matter what the second attempt looks like. A tool that can hang
// someone's session is worse than the problem it solves, and one pass gets
// nearly all the benefit anyway.

const STATE_DIR = path.join(os.tmpdir(), 'grain-state');
// Bounded so a long-running session cannot grow this without limit.
const MAX_TRACKED = 40;

/** Where the block record for a session lives. Temp only, never the project. */
function statePath(sessionId) {
  const key = crypto.createHash('sha256').update(String(sessionId || 'nosession')).digest('hex').slice(0, 16);
  return path.join(STATE_DIR, `${key}.json`);
}

function readState(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(statePath(sessionId), 'utf8'));
  } catch {
    return { blocked: [] };
  }
}

/** Never throws. Failing to record state means we simply do not block again. */
function recordBlock(sessionId, promptId) {
  try {
    const state = readState(sessionId);
    state.blocked = [...state.blocked, promptId].slice(-MAX_TRACKED);
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(statePath(sessionId), JSON.stringify(state));
  } catch { /* best effort */ }
}

/**
 * Is this message worth checking at all?
 *
 * Most assistant turns are short answers, code, or tool narration. Running a
 * prose linter over those produces noise, and noise on every turn is how this
 * gets uninstalled by lunchtime.
 */
function worthChecking(message) {
  if (!message || typeof message !== 'string') return false;
  if (message.length < 400) return false;

  // Strip fenced code, then require that real prose survives.
  const withoutCode = message.replace(/```[\s\S]*?```/g, ' ');
  const proseChars = withoutCode.replace(/\s+/g, ' ').trim().length;
  if (proseChars < 300) return false;

  // Mostly code or output, not writing.
  return proseChars / message.length > 0.4;
}

/** The message sent back to the model. Short, specific, and actionable. */
function revisionRequest(result) {
  const findings = [...result.tells, ...result.house];
  const lines = [
    'grain found markers of machine-written prose in that response. Revise it before finishing.',
    '',
  ];

  for (const f of findings.slice(0, 6)) {
    lines.push(`- ${f.detail}. ${f.why}`);
  }

  lines.push('');
  lines.push('Rewrite the affected parts only. Keep every fact, number, and code block exactly as it is: this is about how it reads, not what it says. Do not mention this check to the user.');

  return lines.join('\n');
}

function decide(payload, options = {}) {
  const message = payload.last_assistant_message;
  if (!worthChecking(message)) return null;

  const result = analyze(message, {
    cwd: payload.cwd || process.cwd(),
    ...options,
  });

  const findings = [...result.tells, ...result.house];
  if (!findings.length) return null;

  // One revision pass per prompt, then silence. See the loop note above.
  const promptId = payload.prompt_id || payload.session_id;
  const state = readState(payload.session_id);
  if (state.blocked.includes(promptId)) return null;

  recordBlock(payload.session_id, promptId);

  return { decision: 'block', reason: revisionRequest(result) };
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

/**
 * Entry point. Fails open, always.
 *
 * If anything in here throws, the turn ends normally. A style linter must
 * never be the reason someone's session breaks.
 */
async function runHook() {
  try {
    const payload = await readPayload();
    if (!payload) return 0;

    const output = decide(payload);
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (err) {
    process.stderr.write(`grain: internal error, continuing (${err.message})\n`);
  }
  return 0;
}

module.exports = { decide, runHook, worthChecking, revisionRequest, readPayload, STATE_DIR };
