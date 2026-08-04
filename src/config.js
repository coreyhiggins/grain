'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

// Custom modes, and the prompt injection problem they create.
//
// THE THREAT, stated plainly.
//
// A custom mode is a block of text that grain injects into the model's
// context on every matching prompt. If grain read that text out of the
// working directory with no ceremony, then cloning a repository and opening
// an agent in it would hand that repository's author a write primitive on
// your model's instructions. Not a theoretical one. A file called
// `.grain.json` sitting in a repo you cloned to review a pull request.
//
// "Guidance" and "instructions the model will follow" are the same bytes.
// There is no parser that can separate them, and any attempt to filter for
// dangerous phrasing is a blocklist against natural language, which loses.
//
// THE ANSWER: direnv's model.
//
// direnv solved this exact shape years ago. A project may carry a config, but
// it does nothing until you explicitly allow it, and any edit revokes that
// approval until you allow it again. Approval is keyed to the CONTENT, not the
// path, so a file that changes under you is a file that has to be re-approved.
//
// So: user-level config is trusted, because you wrote it. Project-level config
// is inert until `grain trust` records its hash. Nothing is injected from an
// untrusted file, ever, and grain says out loud when it is ignoring one.

const USER_DIR = path.join(os.homedir(), '.grain');
const USER_CONFIG = path.join(USER_DIR, 'config.json');
const TRUST_STORE = path.join(USER_DIR, 'trusted.json');
const PROJECT_CONFIG = '.grain.json';

// A custom block is injected on every matching turn, so an unbounded one is
// both a token bill and a bigger injection surface. This is generous for
// real guidance and far below anything that could hide a long payload.
const MAX_BLOCK_CHARS = 2000;
const MAX_MODES = 12;

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readTrustStore() {
  return readJson(TRUST_STORE) || {};
}

/** Record the current content hash of a project config as approved. */
function trustProject(dir) {
  const file = path.join(path.resolve(dir), PROJECT_CONFIG);
  if (!fs.existsSync(file)) return { ok: false, reason: `no ${PROJECT_CONFIG} in ${dir}` };

  const raw = fs.readFileSync(file, 'utf8');
  const store = readTrustStore();
  store[file] = sha256(raw);

  fs.mkdirSync(USER_DIR, { recursive: true });
  fs.writeFileSync(TRUST_STORE, JSON.stringify(store, null, 2));
  return { ok: true, file, hash: store[file] };
}

function untrustProject(dir) {
  const file = path.join(path.resolve(dir), PROJECT_CONFIG);
  const store = readTrustStore();
  if (!(file in store)) return { ok: false, reason: 'was not trusted' };
  delete store[file];
  fs.mkdirSync(USER_DIR, { recursive: true });
  fs.writeFileSync(TRUST_STORE, JSON.stringify(store, null, 2));
  return { ok: true, file };
}

/**
 * Read the project config, and say whether it is allowed to be used.
 *
 * Returns { state, config, file }. `state` is one of:
 *   'none'      no project config exists
 *   'trusted'   exists and its current content is approved
 *   'untrusted' exists but has never been approved
 *   'changed'   was approved, then edited, so approval no longer applies
 *   'invalid'   exists but is not readable JSON
 */
function readProjectConfig(dir = process.cwd()) {
  const file = path.join(path.resolve(dir), PROJECT_CONFIG);
  if (!fs.existsSync(file)) return { state: 'none', config: null, file };

  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return { state: 'invalid', config: null, file }; }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { state: 'invalid', config: null, file }; }

  const approved = readTrustStore()[file];
  if (!approved) return { state: 'untrusted', config: null, file };
  if (approved !== sha256(raw)) return { state: 'changed', config: null, file };

  return { state: 'trusted', config: parsed, file };
}

/**
 * Custom guidance is framed before it reaches the model.
 *
 * Even trusted config is text somebody typed, and the model should know where
 * it came from. Naming the source means a block that starts issuing orders
 * reads as a project file overstepping rather than as a system instruction.
 */
function frameCustom(name, block, origin = 'project') {
  // The origin has to be accurate. This used to say "from .grain.json in this
  // repository" for everything, including modes defined in the user's own
  // ~/.grain/config.json, which told the model a repository had written
  // something the user wrote themselves. The whole point of framing is telling
  // the model where text came from, so getting the source wrong defeats it.
  const source = origin === 'user'
    ? 'from your own ~/.grain/config.json, written by you'
    : 'from .grain.json in this repository, written by the project, not by grain';

  return `Custom guidance for "${name}" (${source}):\n\n${block}`;
}

/** Validate one custom mode. Anything malformed is dropped, never guessed at. */
function normalizeMode(name, raw, origin = 'project') {
  if (!raw || typeof raw !== 'object') return null;
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(name)) return null;

  const list = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.length > 1 && s.length < 60) : []);
  const strong = list(raw.strong);
  const weak = list(raw.weak);
  if (!strong.length && !weak.length) return null;

  const block = typeof raw.guidance === 'string' ? raw.guidance.trim() : '';
  if (!block || block.length > MAX_BLOCK_CHARS) return null;

  return { strong, weak, guidance: frameCustom(name, block, origin), custom: true };
}

/**
 * Merge user and project settings into something the router can use.
 *
 * Project config only participates when trusted. `warning` is non-null when a
 * config was found and deliberately ignored, so the CLI can tell someone why
 * their file is doing nothing rather than leaving them to guess.
 */
function loadConfig(dir = process.cwd()) {
  const result = {
    modes: {}, phrases: [], disable: [], thresholds: {}, paths: {}, fallback: null, warning: null, sources: [],
  };

  const merge = (cfg, label, origin) => {
    if (!cfg || typeof cfg !== 'object') return;
    result.sources.push(label);

    if (cfg.modes && typeof cfg.modes === 'object') {
      for (const [name, raw] of Object.entries(cfg.modes)) {
        if (Object.keys(result.modes).length >= MAX_MODES) break;
        const mode = normalizeMode(name, raw, origin);
        if (mode) result.modes[name] = mode;
      }
    }
    if (Array.isArray(cfg.phrases)) {
      result.phrases.push(...cfg.phrases.filter((p) => typeof p === 'string' && p.length > 2 && p.length < 60));
    }
    if (Array.isArray(cfg.disable)) {
      result.disable.push(...cfg.disable.filter((d) => typeof d === 'string'));
    }
    if (cfg.thresholds && typeof cfg.thresholds === 'object') {
      Object.assign(result.thresholds, cfg.thresholds);
    }

    // The discipline this repository defaults to when nothing else matched.
    //
    // Opt-in, and off unless a project asks for it. Setting it is a claim about
    // the repository: "substantial requests here are usually engineering". That
    // claim is true of most application repos and false of a docs site, which
    // is exactly why grain will not guess it.
    //
    // A mode name only, like `paths`, so it cannot carry text into context.
    if (typeof cfg.fallback === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(cfg.fallback)) {
      result.fallback = cfg.fallback;
    }

    // Glob to mode, so a project can route on its own layout rather than on
    // whether the request happened to use the right verb. Values are mode
    // names only: this cannot inject text, so it needs no framing.
    if (cfg.paths && typeof cfg.paths === 'object' && !Array.isArray(cfg.paths)) {
      for (const [glob, modes] of Object.entries(cfg.paths)) {
        if (typeof glob !== 'string' || glob.length > 200) continue;
        const list = [].concat(modes).filter((m) => typeof m === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(m));
        if (list.length) result.paths[glob] = list;
      }
    }
  };

  merge(readJson(USER_CONFIG), USER_CONFIG, 'user');

  const project = readProjectConfig(dir);
  if (project.state === 'trusted') {
    merge(project.config, project.file, 'project');
  } else if (project.state !== 'none') {
    result.warning = {
      state: project.state,
      file: project.file,
      message: project.state === 'invalid'
        ? `${PROJECT_CONFIG} is not valid JSON, so it is being ignored.`
        : project.state === 'changed'
          ? `${PROJECT_CONFIG} changed since you trusted it. Run "grain trust" to approve the new version.`
          : `${PROJECT_CONFIG} is not trusted, so it is being ignored. Read it, then run "grain trust" if you want it.`,
    };
  }

  return result;
}

module.exports = {
  loadConfig, readProjectConfig, trustProject, untrustProject,
  sha256, frameCustom, normalizeMode,
  USER_CONFIG, TRUST_STORE, PROJECT_CONFIG, MAX_BLOCK_CHARS, MAX_MODES,
};
