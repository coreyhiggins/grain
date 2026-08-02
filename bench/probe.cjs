'use strict';

// Staged probe used by the startup benchmark, so each stage can be timed as
// its own cold process without shell quoting getting in the way.

const stage = process.argv[2];
const PROMPT = 'refactor the parser and extract the escape logic';

if (stage === 'require') {
  require('../src/prompt-hook');
} else if (stage === 'cache-read') {
  // Just reading and parsing the cached index, nothing else.
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'grain-index.json'), 'utf8'));
} else if (stage === 'config') {
  require('../src/config').loadConfig(process.cwd());
} else if (stage === 'route') {
  const { route } = require('../src/route');
  const cfg = require('../src/config').loadConfig(process.cwd());
  route(PROMPT, cfg);
} else if (stage === 'skills') {
  require('../src/skills').matchSkills(PROMPT, { cwd: process.cwd() });
} else if (stage === 'decide') {
  require('../src/prompt-hook').decide({ prompt: PROMPT, session_id: 'probe', cwd: process.cwd() });
}
