'use strict';

// Source hygiene, kept in its own file so the escaping that caused these bugs
// cannot recur while editing the file that tests for them.
//
// Two real defects came from escape sequences being interpreted at write time
// rather than staying literal:
//
//   1. A regex meant to contain a word boundary got a literal BACKSPACE
//      (U+0008) instead of backslash-b. It compiled, matched nothing, and
//      silently disabled a feature with no error anywhere.
//   2. A glob helper got a NUL byte (U+0000) where a placeholder character
//      should have been. It worked, purely by accident, and would have broken
//      the moment any tool normalised the file.
//
// Both are invisible in an editor and neither fails a linter.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['src', 'bench', 'test'];

/** Raw control bytes sitting in source, as opposed to escapes inside strings. */
function findControlBytes(text) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const ch of line) {
      const code = ch.charCodeAt(0);
      // Allow tab (9). Disallow everything else below space, plus DEL.
      // ESC (27) is allowed because terminal colour codes use it on purpose.
      const isControl = (code < 32 && code !== 9 && code !== 27) || code === 127;
      if (isControl) found.push(`line ${i + 1}: U+${code.toString(16).padStart(4, '0')}`);
    }
  });
  return found;
}

function run() {
  const failures = [];

  for (const dir of DIRS) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (!name.endsWith('.js')) continue;
      const hits = findControlBytes(fs.readFileSync(path.join(full, name), 'utf8'));
      for (const h of hits) failures.push(`${dir}/${name} ${h}`);
    }
  }

  assert.deepStrictEqual(failures, [], `raw control bytes in source:\n  ${failures.join('\n  ')}`);

  // The two helpers the bugs actually broke.
  const { globToRegExp } = require('../src/paths');
  assert.ok(globToRegExp('renderer/**').test('renderer/index.html'), 'glob ** broken');
  assert.ok(globToRegExp('**/*.test.ts').test('src/api/client.test.ts'), 'glob suffix broken');
  assert.ok(!globToRegExp('renderer/**').test('src/index.html'), 'glob matches too much');

  const { route } = require('../src/route');
  const r = route('briefly, what time is the deploy');
  assert.ok(r && r.modes.some((m) => m.mode === 'terse'), 'explicit brevity request did not route');

  return failures.length === 0;
}

if (require.main === module) {
  try {
    run();
    console.log('  source hygiene: ok');
  } catch (err) {
    console.error(`  source hygiene: FAIL\n${err.message}`);
    process.exit(1);
  }
}

module.exports = { run, findControlBytes };
