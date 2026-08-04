#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { analyze, summarize } = require('../src/analyze');
const { buildProfile } = require('../src/profile');
const { runHook } = require('../src/hook');
const { runPromptHook } = require('../src/prompt-hook');
const { route } = require('../src/route');
const { blockFor, approxTokens } = require('../src/modes');
const {
  loadConfig, readProjectConfig, trustProject, untrustProject, PROJECT_CONFIG,
} = require('../src/config');
const { discoverSkills, discoverAll, matchSkills } = require('../src/skills');
const pin = require('../src/pin');
const { diagnose } = require('../src/doctor');
const { BLOCKS } = require('../src/modes');

// The command line.
//
// grain's default mode is the Stop hook, which runs without anyone typing
// anything. This CLI is for the other three moments: checking a file you are
// about to send, checking what you are about to commit, and looking at what
// grain thinks your project sounds like.
//
// Findings print as path:line so terminals and editors make them clickable,
// and every one names the line you can go argue with. That is the whole
// design: a finding you cannot check is just an opinion with a font.

const USAGE = `grain: the discipline layer for AI coding

Reads what you asked for and brings the right discipline: engineering
restraint, orchestration, design judgment, or writing voice. Says nothing
on the turns that do not need it.

Routing
  grain route "<prompt>"    show which discipline a prompt gets, and its cost
  grain why                 explain what the last turn matched, and why
  grain stats               what grain has been doing, from its own log
  grain skills ["<prompt>"] list installed skills, or which ones a prompt hits
  grain pin <mode>          force a discipline instead of auto-detecting
  grain unpin               go back to auto-detection
  grain off / grain on      disable or enable grain entirely

Project settings
  grain trust               approve this project's .grain.json after reading it
  grain untrust             withdraw that approval
  grain doctor              check that grain is installed and working

Writing voice
  grain profile             show the voice grain learned from this project
  grain check <file...>     check prose for machine tells (EXPERIMENTAL)
  grain check --staged      check what you are about to commit
  cat draft.md | grain      check stdin

Hooks, wired for you by the plugin
  grain prompt-hook         run as a UserPromptSubmit hook (JSON on stdin)
  grain hook                run as a Stop hook (JSON on stdin)

Options
  --no-house                skip house-style findings, universal tells only
  --quiet                   print only files that have findings
  --no-fail                 always exit 0, even when findings exist

"grain check" is experimental and its own benchmark says so. It failed to
beat a coin flip on modern machine prose and is kept for the house-style
rules, which are checkable. Everything above it is measured; see the README.

Exit code is 1 when "grain check" finds something, so CI can gate on it.
`;

const RED = process.stdout.isTTY ? '[31m' : '';
const DIM = process.stdout.isTTY ? '[2m' : '';
const BOLD = process.stdout.isTTY ? '[1m' : '';
const OFF = process.stdout.isTTY ? '[0m' : '';

function stagedFiles() {
  try {
    const raw = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    });
    return raw.split('\n')
      .map((s) => s.trim())
      .filter((s) => /\.(md|markdown|mdx|txt|rst)$/i.test(s))
      .filter((s) => fs.existsSync(s));
  } catch {
    console.error('grain: not a git repository, or git is unavailable.');
    process.exit(2);
  }
  return [];
}

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', () => resolve(''));
  });
}

/** Print one file's findings. Returns how many there were. */
function report(label, result, opts) {
  const findings = [...result.tells, ...(opts.house ? result.house : [])];

  if (!findings.length) {
    if (!opts.quiet) console.log(`${DIM}${label}${OFF}  ${result.words} words, reads clean`);
    return 0;
  }

  console.log(`\n${BOLD}${label}${OFF}  ${DIM}${result.words} words, ${summarize(result)}${OFF}`);
  for (const f of findings) {
    const where = f.line ? `${label}:${f.line}` : label;
    console.log(`  ${RED}${f.rule}${OFF}  ${where}`);
    console.log(`    ${f.detail}`);
    console.log(`    ${DIM}${f.why}${OFF}`);
  }
  return findings.length;
}

function showProfile(cwd) {
  const p = buildProfile(cwd);

  console.log(`\n${BOLD}voice of ${p.root}${OFF}\n`);
  console.log(`  learned from   ${p.files} prose files, ${p.words.toLocaleString()} words, ${p.commits} commits`);
  console.log(`  confidence     ${p.confidence}`);

  if (p.confidence === 'insufficient') {
    console.log(`\n  ${DIM}Not enough prose here to have an opinion. grain will still report`);
    console.log(`  universal tells, but it will not tell you what fits this project.${OFF}\n`);
    return 0;
  }

  const num = (v, d = 1) => (v === null ? 'no opinion' : v.toFixed(d));
  console.log('');
  console.log(`  em and en dashes   ${p.dashCount} total (${num(p.dashRate, 2)} per 10k words)`);
  console.log(`  contractions       ${p.contractionRate === null ? 'no opinion' : `${Math.round(p.contractionRate * 100)}% of opportunities`}`);
  console.log(`  sentences          ${num(p.sentenceMean)} words, variation ${num(p.sentenceVariation, 2)}`);
  console.log(`  paragraphs         ${num(p.paragraphMean)} words, variation ${num(p.paragraphVariation, 2)}`);
  if (p.commits) {
    console.log(`  commit subjects    ${num(p.commitSubjectMean)} characters`);
    console.log(`  commit bodies      ${num(p.commitBodyLineMean)} lines`);
  }

  if (p.confidence === 'thin') {
    console.log(`\n  ${DIM}Thin: under 5,000 words. Treat these as a hint, not a rule.${OFF}`);
  }
  console.log('');
  return 0;
}

/**
 * Approve this project's config.
 *
 * The file is printed in full before anything is approved, because the whole
 * point of the trust step is that a person read the text that is about to be
 * injected into their model's context. Approving unseen would be the same as
 * having no trust step at all.
 */
function doTrust(skipPrompt) {
  const project = readProjectConfig(process.cwd());

  if (project.state === 'none') {
    console.log(`No ${PROJECT_CONFIG} here. Nothing to trust.`);
    return;
  }
  if (project.state === 'invalid') {
    console.error(`${project.file} is not valid JSON. Fix it before trusting it.`);
    process.exitCode = 2;
    return;
  }

  const raw = fs.readFileSync(project.file, 'utf8');
  console.log(`\n${BOLD}${project.file}${OFF}\n`);
  console.log(raw.split('\n').map((l) => `  ${l}`).join('\n'));
  console.log(`\n${BOLD}Read the guidance text above.${OFF} Trusting this file means grain will inject`);
  console.log('it into your model\'s context on every matching prompt in this project.\n');

  if (!skipPrompt) {
    console.log(`Run ${BOLD}grain trust --yes${OFF} to approve it.`);
    console.log(`${DIM}Approval is tied to the file's current contents. If it changes, it stops`);
    console.log(`applying until you approve it again.${OFF}\n`);
    return;
  }

  const r = trustProject(process.cwd());
  console.log(r.ok ? `trusted: ${r.file}\n` : `failed: ${r.reason}\n`);
}

/**
 * Show installed skills, or which ones a prompt would surface.
 *
 * Useful in both directions: someone debugging why their skill never fires can
 * see the description grain is matching against, and someone writing a skill
 * can check that its description actually contains the words people type.
 */
function showSkills(prompt) {
  const cwd = process.cwd();
  const installed = discoverSkills(cwd);

  if (!installed.length) {
    console.log(`\n  ${DIM}No skills found in ~/.claude/skills or ./.claude/skills${OFF}\n`);
    return;
  }

  if (!prompt.trim()) {
    console.log(`\n  ${BOLD}${installed.length} skills installed${OFF}\n`);
    for (const s of installed) {
      const desc = s.description || `${DIM}(no description, so it can never be matched)${OFF}`;
      console.log(`  ${s.name}`);
      console.log(`    ${DIM}${desc.slice(0, 140)}${desc.length > 140 ? '...' : ''}${OFF}`);
    }
    console.log('');
    return;
  }

  const matches = matchSkills(prompt, { cwd, skills: installed });
  if (!matches.length) {
    console.log(`\n  ${BOLD}no skill matched${OFF}  ${DIM}nothing would be suggested for this prompt${OFF}\n`);
    return;
  }

  console.log(`\n  ${BOLD}${matches.length} of ${installed.length} skills matched${OFF}\n`);
  for (const m of matches) {
    // IDF weighting produces floats, and "score 13.493640329756754" is noise
    // pretending to be precision. One decimal is more than the ranking needs.
    console.log(`  ${m.name}  ${DIM}score ${Number(m.score).toFixed(1)}${m.nameHit ? ', named directly' : ''}${OFF}`);
    if (m.matched.length) console.log(`    ${DIM}on: ${m.matched.join(', ')}${OFF}`);
  }
  console.log('');
}

/** Pin a mode so detection stops guessing. */
function doPin(mode) {
  const available = Object.keys(BLOCKS);
  if (!mode || !available.includes(mode)) {
    console.error(`usage: grain pin <mode>
  modes: ${available.join(', ')}`);
    process.exitCode = 2;
    return;
  }
  pin.pin(mode);
  console.log(`pinned ${mode}. every prompt gets this until you run: grain unpin`);
}

/**
 * Explain the last decision.
 *
 * A tool that silently edits the context of every prompt owes you an answer to
 * "what did you just do". This is that answer.
 */
function doWhy() {
  if (!pin.isEnabled()) { console.log(`\n  grain is off. turn it on with: grain on\n`); return; }

  const forced = pin.pinned();
  if (forced) console.log(`\n  ${BOLD}${forced}${OFF} is pinned, so detection is not running`);

  const l = pin.last();
  if (!l) { console.log(`\n  no decision recorded yet\n`); return; }

  if (!l.modes.length) {
    console.log(`\n  last turn: ${BOLD}nothing injected${OFF}  ${DIM}(nothing scored high enough)${OFF}\n`);
    return;
  }

  console.log(`\n  last turn: ${BOLD}${l.modes.join(' + ')}${OFF}`);
  if (l.inherited) console.log(`  ${DIM}inherited from an earlier turn, this prompt carried no signal${OFF}`);
  else if (l.pinned) console.log(`  ${DIM}pinned by you, not detected${OFF}`);
  else console.log(`  ${DIM}score ${l.score} via ${l.signals.join(', ')}${OFF}`);
  console.log(`  ${DIM}${l.at}${OFF}\n`);
}

/**
 * What grain has actually been doing, from its own log.
 *
 * This exists because grain published a coverage figure of 51% for most of its
 * life while managing 13% on prompts people type, and nobody could tell,
 * because the tool kept no record of itself. Coverage only: there is no
 * accuracy number here, because measuring that needs the prompt text and grain
 * does not keep it.
 */
function doStats() {
  const s = pin.stats();
  if (!s) {
    console.log(`\n  no turns logged yet. grain records every prompt it sees, including the quiet ones.\n`);
    return;
  }

  const pct = (n) => `${((n / s.turns) * 100).toFixed(0)}%`;
  console.log(`\n  ${BOLD}${s.turns}${OFF} turns logged${s.since ? `${DIM}, since ${String(s.since).slice(0, 10)}${OFF}` : ''}\n`);
  console.log(`  spoke    ${String(s.spoke).padStart(5)}  ${pct(s.spoke)}`);
  console.log(`  silent   ${String(s.silent).padStart(5)}  ${pct(s.silent)}`);

  if (s.modes.length) {
    console.log(`\n  ${DIM}modes${OFF}`);
    for (const [m, c] of s.modes) console.log(`    ${m.padEnd(16)}${String(c).padStart(5)}`);
  }
  if (s.inherited || s.fallback) {
    console.log(`\n  ${DIM}of the turns it spoke on${OFF}`);
    if (s.inherited) console.log(`    ${String(s.inherited).padStart(5)}  carried over from an earlier turn`);
    if (s.fallback) console.log(`    ${String(s.fallback).padStart(5)}  came from this repo's declared fallback`);
  }

  console.log(`\n  ${DIM}coverage only. grain keeps no prompt text, so it cannot tell you`);
  console.log(`  whether the modes it picked were the right ones.${OFF}\n`);
}

/**
 * Report what is actually true on disk.
 *
 * grain shipped seven versions whose manifest made the whole plugin fail to
 * load, while `claude plugin validate --strict` passed every time. This is
 * the command that would have caught it on day one.
 */
function doDoctor() {
  const { checks, versions: v } = diagnose(process.cwd());

  const mark = {
    ok: `${DIM}ok  ${OFF}`,
    note: `${DIM}note${OFF}`,
    warn: `${RED}warn${OFF}`,
    fail: `${RED}FAIL${OFF}`,
  };

  console.log(`\n  ${BOLD}grain doctor${OFF}  ${DIM}cli ${v.cli || "?"}${OFF}\n`);
  for (const c of checks) {
    console.log(`  ${mark[c.level] || c.level}  ${c.title}`);
    if (c.detail) console.log(`        ${DIM}${c.detail}${OFF}`);
  }

  const bad = checks.filter((c) => c.level === "fail" || c.level === "warn");
  if (!bad.length) {
    console.log(`\n  ${DIM}Nothing to fix. No network calls were made to check this.${OFF}\n`);
  } else {
    console.log(`\n  ${bad.length} thing(s) worth fixing above.\n`);
    process.exitCode = 1;
  }
}
/** Print why a project config is being ignored, if it is. */
function warnAboutConfig(config) {
  if (!config.warning) return;
  console.log(`\n  ${RED}${config.warning.state}${OFF}  ${config.warning.file}`);
  console.log(`  ${config.warning.message}`);
}

/**
 * Show what the router would do with a prompt, and what it would cost.
 *
 * This exists so the routing is auditable. A tool that silently injects text
 * into every one of your prompts should be able to show you exactly what it
 * injects and when, without you having to read its source.
 */
function showRoute(prompt) {
  if (!prompt.trim()) {
    console.error('usage: grain route "your prompt here"');
    process.exitCode = 2;
    return;
  }

  const config = loadConfig(process.cwd());
  warnAboutConfig(config);

  const decision = route(prompt, config);
  if (!decision) {
    console.log(`\n  ${BOLD}no mode${OFF}  nothing injected, this turn costs zero extra tokens`);
    console.log(`  ${DIM}Either the signal was weak or two modes were too close to call.${OFF}\n`);
    return;
  }

  const block = decision.custom
    ? config.modes[decision.mode].guidance
    : blockFor(decision.mode);
  console.log(`\n  ${BOLD}${decision.mode}${OFF}${decision.custom ? ` ${DIM}(custom)${OFF}` : ''}`
    + `  score ${decision.score}, about ${approxTokens(block)} tokens injected`);
  if (decision.runnerUp) {
    console.log(`  ${DIM}runner up: ${decision.runnerUp.mode} at ${decision.runnerUp.score}${OFF}`);
  }
  console.log(`  ${DIM}matched: ${decision.signals.join(', ')}${OFF}\n`);
  console.log(block.split('\n').map((l) => `    ${DIM}${l}${OFF}`).join('\n'));
  console.log('');
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv[0] === 'hook') {
    process.exitCode = await runHook();
    return;
  }
  if (argv[0] === 'prompt-hook') {
    process.exitCode = await runPromptHook();
    return;
  }
  if (argv[0] === 'route') {
    showRoute(argv.slice(1).join(' '));
    return;
  }
  if (argv[0] === 'pin') { doPin(argv[1]); return; }
  if (argv[0] === 'unpin') {
    const was = pin.unpin();
    console.log(was ? `unpinned ${was}, auto-detection is back on` : 'nothing was pinned');
    return;
  }
  if (argv[0] === 'off') { pin.setEnabled(false); console.log('grain is off. turn it back on with: grain on'); return; }
  if (argv[0] === 'on') { pin.setEnabled(true); console.log('grain is on'); return; }
  if (argv[0] === 'why') { doWhy(); return; }
  if (argv[0] === 'stats') { doStats(); return; }
  if (argv[0] === 'doctor') { doDoctor(); return; }
  if (argv[0] === 'skills') { showSkills(argv.slice(1).join(' ')); return; }
  if (argv[0] === 'trust') { doTrust(argv.includes('--yes')); return; }
  if (argv[0] === 'untrust') {
    const r = untrustProject(process.cwd());
    console.log(r.ok ? `withdrawn: ${r.file}` : `nothing to withdraw (${r.reason})`);
    return;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return;
  }

  const opts = {
    house: !argv.includes('--no-house'),
    quiet: argv.includes('--quiet'),
    fail: !argv.includes('--no-fail'),
  };
  const rest = argv.filter((a) => !a.startsWith('-'));

  if (rest[0] === 'profile') {
    showProfile(process.cwd());
    return;
  }

  let targets = rest[0] === 'check' ? rest.slice(1) : rest;
  if (argv.includes('--staged')) targets = stagedFiles();

  // No files named and stdin is a pipe: read the piped text.
  if (!targets.length && !process.stdin.isTTY) {
    const text = await readStdin();
    if (!text.trim()) { console.log(USAGE); return; }
    const result = analyze(text, { cwd: process.cwd() });
    const n = report('(stdin)', result, opts);
    if (n && opts.fail) process.exitCode = 1;
    return;
  }

  if (!targets.length) { console.log(USAGE); return; }

  let total = 0;
  let checked = 0;
  for (const target of targets) {
    let text;
    try { text = fs.readFileSync(target, 'utf8'); } catch {
      console.error(`grain: cannot read ${target}`);
      continue;
    }
    checked += 1;
    total += report(path.relative(process.cwd(), target) || target, analyze(text, { cwd: process.cwd() }), opts);
  }

  if (checked > 1) {
    console.log(`\n${total ? `${total} finding${total > 1 ? 's' : ''}` : 'nothing'} across ${checked} files\n`);
  }
  if (total && opts.fail) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`grain: ${err.message}`);
  process.exitCode = 2;
});
