'use strict';

// Pull real typed prompts out of local Claude Code transcripts.
//
//   node bench/extract-real.cjs <outfile-outside-this-repo>
//
// RUN ONLY WITH THE OWNER'S EXPLICIT PERMISSION, AND NEVER COMMIT ITS OUTPUT.
// The script is in the repository because it should be reviewable. The prompts
// it produces are somebody's private working history and stay on their disk.
//
// WHY IT EXISTS.
//
// A 2,000-prompt authored corpus was measured and rejected. Two independent
// reviewers found it classifiable by grammar alone: each label had its own
// sentence template, so mining it would learn sentence frames rather than
// vocabulary, and the holdout carried the same frames. The agreement number
// was 94.4% and meant nothing.
//
// Real prompts have no such templates, because nobody wrote them to a spec.
//
// WHAT IT REFUSES TO TAKE.
//
// Only the user's own typed messages. No assistant replies, no tool results,
// no file contents, no attachments, no command output, no subagent traffic.
// On top of that:
//
//   - anything matching a secret shape is dropped WHOLE, never masked. A
//     redacted secret still tells a reader that a secret was there.
//   - absolute paths, home directories, hostnames, IPs and emails are dropped,
//     because they identify a machine or a person rather than a request.
//   - anything long is dropped. Long messages are nearly always pasted
//     material, which is exactly the content that is not the user's to share.
//
// The measurement needs the shape of how people phrase requests. It does not
// need, and must not take, what those requests were about.

const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const MAX_CHARS = 400;
const MIN_CHARS = 3;

// Shapes that mean "this may carry a secret". Dropped whole.
const SECRET_SHAPES = [
  /\b[A-Za-z0-9_-]{32,}\b/,
  /\b(sk|pk|gh[pousr]|xox[baprs]|AKIA|ASIA)[-_][A-Za-z0-9]{8,}/i,
  /-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)/,
  /\b[A-Fa-f0-9]{40,}\b/,
  /\b(password|api[_-]?key|secret|token|credential)\b\s*[:=]/i,
  /\bBearer\s+\S+/i,
];

// Shapes that identify a machine or a person.
const IDENTIFYING = [
  /[A-Za-z]:[\\/]/,
  /\/(home|Users)\//,
  /\b\d{1,3}(\.\d{1,3}){3}\b/,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
];

/** A message a person typed, as opposed to machinery or a subagent. */
function isTypedByHuman(record) {
  if (!record || record.type !== 'user') return false;
  if (record.isSidechain) return false;
  if (record.userType && record.userType !== 'external') return false;
  return typeof (record.message && record.message.content) === 'string';
}

function classify(raw) {
  const t = raw.trim();
  if (t.length < MIN_CHARS) return 'tooShort';
  if (t.length > MAX_CHARS) return 'tooLong';
  if (SECRET_SHAPES.some((re) => re.test(t))) return 'secretShape';
  if (IDENTIFYING.some((re) => re.test(t))) return 'identifying';
  if (t.startsWith('/') || t.startsWith('<') || /^[#!$]/.test(t)) return 'notProse';
  if (/system-reminder|<command-|Caveat:|\[Request interrupted/i.test(t)) return 'notProse';
  // The client writes these into the user turn when an image is attached. They
  // look like typed text and are not.
  if (/^\[Image:|^\[Pasted text|^\[image #\d/i.test(t)) return 'notProse';
  if (t.includes('```') || (t.match(/\n/g) || []).length > 4) return 'pasted';
  return 'keep';
}

function main() {
  const outFile = process.argv[2];
  if (!outFile) {
    console.error('usage: node bench/extract-real.cjs <outfile>');
    process.exit(1);
  }

  const resolved = path.resolve(outFile);
  if (resolved.startsWith(path.resolve(__dirname, '..'))) {
    console.error('refusing to write inside the repository. These prompts are not publishable.');
    process.exit(1);
  }

  const stats = {
    files: 0, typed: 0, keep: 0, tooLong: 0, tooShort: 0, secretShape: 0, identifying: 0, notProse: 0, pasted: 0, duplicate: 0,
  };
  const seen = new Set();
  const prompts = [];

  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.name.endsWith('.jsonl')) continue;

      stats.files += 1;
      let text;
      try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }

      for (const line of text.split('\n')) {
        if (!line) continue;
        let record;
        try { record = JSON.parse(line); } catch { continue; }
        if (!isTypedByHuman(record)) continue;

        stats.typed += 1;
        const raw = record.message.content.trim();
        const verdict = classify(raw);
        if (verdict !== 'keep') { stats[verdict] += 1; continue; }

        const key = raw.toLowerCase();
        if (seen.has(key)) { stats.duplicate += 1; continue; }
        seen.add(key);
        prompts.push(raw);
        stats.keep += 1;
      }
    }
  };

  walk(PROJECTS);
  fs.writeFileSync(resolved, JSON.stringify(prompts, null, 1));

  console.log(`\n  ${stats.files} transcripts, ${stats.typed} messages typed by a person\n`);
  console.log(`  kept                  ${String(stats.keep).padStart(6)}`);
  console.log(`  dropped, too long     ${String(stats.tooLong).padStart(6)}   pasted material`);
  console.log(`  dropped, secret shape ${String(stats.secretShape).padStart(6)}`);
  console.log(`  dropped, identifying  ${String(stats.identifying).padStart(6)}   paths, hosts, emails`);
  console.log(`  dropped, not prose    ${String(stats.notProse).padStart(6)}   commands, system text`);
  console.log(`  dropped, pasted       ${String(stats.pasted).padStart(6)}   code blocks`);
  console.log(`  dropped, duplicate    ${String(stats.duplicate).padStart(6)}`);
  console.log(`  dropped, too short    ${String(stats.tooShort).padStart(6)}`);
  console.log(`\n  written to ${resolved}`);
  console.log('  Outside the repository. Not publishable, not committed.\n');
}

if (require.main === module) main();
