'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadConfig, readProjectConfig, PROJECT_CONFIG } = require('./config');
const { discoverAll } = require('./skills');
const pin = require('./pin');
const { newest, compare } = require('./semver');

// Checking that grain is actually working.
//
// This exists because of a specific failure. grain shipped seven versions with
// a manifest that named `hooks/hooks.json`, a file Claude Code already loads
// automatically. The duplicate reference failed the ENTIRE plugin, so the
// router never ran. `claude plugin validate --strict` passed the whole time.
// The only place the truth appeared was `claude plugin list`, which nobody
// thinks to check.
//
// So this reports what is actually true on disk rather than what should be:
// which versions are installed, whether they agree, whether config is being
// ignored, and whether the index has anything in it.
//
// NO NETWORK. grain promises it makes no network calls, and a diagnostic is
// not a good enough reason to break that. Version drift is detected by
// comparing the copies already on this machine, which catches the case that
// actually bites: an updated marketplace clone with a stale installed copy.

const CLAUDE = path.join(os.homedir(), '.claude');
const PLUGIN_CACHE = path.join(CLAUDE, 'plugins', 'cache');
const MARKETPLACES = path.join(CLAUDE, 'plugins', 'marketplaces');
const INDEX_CACHE = path.join(os.tmpdir(), 'grain-index.json');

const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
};

/** Versions of every copy of grain on this machine. */
function versions() {
  const found = {};

  found.cli = readJson(path.join(__dirname, '..', 'package.json'))?.version || null;

  const market = readJson(path.join(MARKETPLACES, 'grain', '.claude-plugin', 'plugin.json'));
  found.marketplace = market ? market.version : null;

  // The installed copy lives in a directory named for its version.
  try {
    const dir = path.join(PLUGIN_CACHE, 'grain', 'grain');
    const dirs = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    // The truth is in installed_plugins.json. Directory names only say what
    // has ever been downloaded, and old copies are never cleaned up.
    const record = readJson(path.join(CLAUDE, 'plugins', 'installed_plugins.json'));
    const entry = record && record['grain@grain'];
    const recorded = Array.isArray(entry) && entry.length ? entry[0].version : null;

    found.installed = recorded || newest(dirs);
    found.staleCopies = dirs.filter((d) => d !== found.installed).sort(compare);
  } catch {
    found.installed = null;
    found.staleCopies = [];
  }

  return found;
}

/** Everything worth reporting, as data rather than printed text. */
function diagnose(cwd = process.cwd()) {
  const checks = [];
  const add = (level, title, detail) => checks.push({ level, title, detail });

  const v = versions();

  if (!v.installed) {
    add('warn', 'plugin not installed', 'grain is not in the Claude Code plugin cache. The CLI still works.');
  } else if (v.marketplace && v.installed !== v.marketplace) {
    add('warn', `installed ${v.installed}, marketplace has ${v.marketplace}`,
      'Run: claude plugin update grain@grain');
  } else {
    add('ok', `plugin ${v.installed}`, 'matches the marketplace copy');
  }

  if (v.cli && v.installed && v.cli !== v.installed) {
    add('warn', `CLI ${v.cli}, plugin ${v.installed}`,
      'The two get updated separately. Run: npm install -g @coreyhiggins/grain');
  }

  if (v.staleCopies.length) {
    add('note', `${v.staleCopies.length} old version(s) left in the cache`,
      `${v.staleCopies.join(', ')}. Harmless, but they can be deleted.`);
  }

  // The failure that started all this: a plugin present on disk but refusing
  // to load. Only `claude plugin list` knows, and this cannot run it without
  // shelling out, so it checks the manifest defect that caused it instead.
  const manifest = v.installed
    ? readJson(path.join(PLUGIN_CACHE, 'grain', 'grain', v.installed, '.claude-plugin', 'plugin.json'))
    : null;
  if (manifest && manifest.hooks && /hooks\/hooks\.json$/.test(String(manifest.hooks))) {
    add('fail', 'the manifest re-declares hooks/hooks.json',
      'Claude Code loads that file automatically, so naming it fails the whole plugin. Check: claude plugin list');
  }

  // Config
  const config = loadConfig(cwd);
  const project = readProjectConfig(cwd);

  if (config.warning) {
    add('warn', `${PROJECT_CONFIG} is being ignored`, config.warning.message);
  } else if (project.state === 'trusted') {
    add('ok', `${PROJECT_CONFIG} trusted`, `${Object.keys(config.modes).length} custom mode(s), ${Object.keys(config.paths).length} path rule(s)`);
  }

  const userConfig = config.sources.find((s) => s.includes('.grain'));
  add(userConfig ? 'ok' : 'note',
    userConfig ? 'user config loaded' : 'no user config',
    userConfig || 'Optional. ~/.grain/config.json holds modes and path rules that apply everywhere.');

  // The index
  const items = discoverAll(cwd);
  const agents = items.filter((i) => i.kind === 'agent').length;
  if (!items.length) {
    add('warn', 'no skills or agents found', 'Skill suggestions will never fire.');
  } else {
    add('ok', `${items.length} skills and agents indexed`, `${items.length - agents} skills, ${agents} agents`);
  }

  const withoutDescription = items.filter((i) => !i.description || i.description.length < 10).length;
  if (withoutDescription) {
    add('note', `${withoutDescription} have no usable description`,
      'Those can never be matched. See: grain skills');
  }

  try {
    const age = Date.now() - fs.statSync(INDEX_CACHE).mtimeMs;
    add('ok', 'index cache present', `${Math.round(age / 1000)}s old, rebuilt automatically when a directory changes`);
  } catch {
    add('note', 'index cache missing', 'It will be built on the next prompt.');
  }

  // State
  if (!pin.isEnabled()) {
    add('warn', 'grain is switched off', 'Nothing is being injected. Turn it on with: grain on');
  }
  const pinned = pin.pinned();
  if (pinned) {
    add('note', `${pinned} is pinned`, 'Detection is not running. Undo with: grain unpin');
  }

  return { checks, versions: v };
}

module.exports = { diagnose, versions };
