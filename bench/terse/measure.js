'use strict';

// The spread measurement.
//
// Six question shapes, each asked twice against the same model in separate
// threads, one question per turn because that is how the hook actually fires.
// The full text of both answers is inline below so the numbers can be
// recomputed and the answers can be read.

const BLOCK_TOKENS = 143;

const PAIRS = [
  {
    id: 'q1',
    shape: 'one-line factual',
    q: 'What does the -p flag do in mkdir?',
    base: "`mkdir -p` creates any missing parent directories and doesn't error if the directory already exists.\n\nExample:\n\n```bash\nmkdir -p projects/my-app/src\n```\n\nThis creates `projects`, `my-app`, and `src` as needed. Without `-p`, it fails if the parent directories don't exist. (`-p` stands for \"parents.\")",
    terse: "`mkdir -p path/to/dir` creates missing parent directories and doesn't error if they already exist.",
  },
  {
    id: 'q2',
    shape: 'yes/no with caveat',
    q: "Does Node's fs.readFileSync block the event loop?",
    base: "Yes. `fs.readFileSync()` blocks Node.js's main thread, and therefore the event loop, until the entire file is read or an error occurs.\n\nUse it mainly during startup, scripts, or CLI initialization. In request handlers or other concurrent server code, prefer:\n\n```js\nconst data = await fs.promises.readFile(path, 'utf8');\n```\n\nThe asynchronous version lets the event loop continue handling other work while the file operation is pending.",
    terse: 'Yes. `fs.readFileSync()` blocks the event loop until the file read completes.',
  },
  {
    id: 'q3',
    shape: 'procedural how-to',
    q: 'How do I squash the last three commits into one?',
    base: "Run:\n\n```bash\ngit rebase -i HEAD~3\n```\n\nIn the editor, keep the first commit as `pick` and change the next two to `squash`:\n\n```text\npick   abc123 First commit\nsquash def456 Second commit\nsquash ghi789 Third commit\n```\n\nSave and close, then edit the combined commit message when prompted.\n\nIf those commits were already pushed, update the remote with:\n\n```bash\ngit push --force-with-lease\n```\n\nUse `--force-with-lease`, not `--force`, to avoid overwriting someone else's newer work.",
    terse: '```bash\ngit rebase -i HEAD~3\n```\n\nChange the second and third commits from `pick` to `squash`, then save and edit the combined commit message.',
  },
  {
    id: 'q4',
    shape: 'comparison',
    q: 'Difference between an index on (a, b) and two separate indexes?',
    base: "A composite index on `(a, b)` is one sorted structure ordered first by `a`, then by `b`. Two separate indexes are independent structures, one sorted by `a`, the other by `b`.\n\n| Query | Index `(a, b)` | Separate indexes on `a`, `b` |\n|---|---|---|\n| `WHERE a = ?` | Good | Good via `a` |\n| `WHERE a = ? AND b = ?` | Excellent, direct combined lookup | Database may combine indexes, but usually less efficient |\n| `WHERE b = ?` | Usually poor due to the leftmost-prefix rule | Good via `b` |\n| `WHERE a = ? ORDER BY b` | Often avoids sorting | Usually requires sorting |\n| Writes/storage | One index to maintain | Two indexes to maintain |\n\nThe key rule for `(a, b)` is that it generally supports queries using its leftmost columns: `a`, or `a` and `b`, but not `b` alone.\n\nFor example:\n\n```sql\nCREATE INDEX idx_ab ON t (a, b);\n```\n\nis usually best when queries commonly filter on `a` and then filter or sort by `b`.\n\n```sql\nCREATE INDEX idx_a ON t (a);\nCREATE INDEX idx_b ON t (b);\n```\n\nis usually best when queries frequently search `a` and `b` independently.\n\nSome databases can perform an index intersection for `WHERE a = ? AND b = ?` using the separate indexes, but that involves finding and combining two sets of row references. A composite index is normally faster for that access pattern. Conversely, `(a, b)` may make a separate index on `a` redundant, but it does not normally replace an index on `b`.",
    terse: 'An index on `(a, b)` is ordered by `a` then `b`, so it efficiently supports queries on `a` or on both `a` and `b`, but usually not `b` alone. Separate indexes support `a`-only and `b`-only queries; some databases can combine them, but typically less efficiently than the composite index for queries using both.',
  },
  {
    id: 'q5',
    shape: 'diagnostic why',
    q: 'Why does my Docker build cache keep invalidating?',
    base: "Usually because an early Dockerfile layer includes files that change frequently. Once that layer changes, Docker rebuilds every layer after it.\n\nA common cache-breaking pattern:\n\n```dockerfile\nCOPY . .\nRUN npm ci\n```\n\nAny source-file change invalidates `COPY . .`, which forces `npm ci` to run again.\n\nStructure it like this instead:\n\n```dockerfile\nFROM node:22\n\nWORKDIR /app\n\nCOPY package.json package-lock.json ./\nRUN npm ci\n\nCOPY . .\n\nRUN npm run build\n```\n\nNow source changes invalidate only the final `COPY` and build layers, not dependency installation.\n\nOther frequent causes:\n\n- Missing `.dockerignore`: `.git`, logs, build artifacts, IDE files, and dependency folders enter the build context and change the `COPY` checksum.\n- Changing build arguments: `ARG` values can invalidate that instruction and subsequent layers.\n- Mutable base images: `FROM node:latest` may resolve to a newer image, especially with `--pull`.\n- Package-manager commands without pinned inputs: `apt-get update`, unpinned packages, or changing lockfiles legitimately produce new layers.\n- Building with `--no-cache`, cache pruning, or using a different builder/CI runner without imported cache.\n- Copying generated metadata into an early layer, such as timestamps, version files, test reports, or coverage output.\n- Multi-stage builds: changing files copied from an earlier stage invalidates dependent layers in later stages.\n- Architecture or build-platform changes: switching between `amd64` and `arm64` uses different cache records.\n\nA solid `.dockerignore` often includes:\n\n```gitignore\n.git\nnode_modules\ndist\nbuild\ncoverage\n*.log\n```\n\nTo see exactly where reuse stops, run:\n\n```\ndocker build --progress=plain .\n```\n\nLook for the first step that is not marked `CACHED`; that step, or one of its inputs, is the cache invalidation source. The key rule is: copy stable dependency manifests first, install dependencies, and copy volatile source files last.",
    terse: "Your Dockerfile likely runs `COPY . .` before installing dependencies, so every source change invalidates all later layers.\n\n```dockerfile\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\n```\n\nAlso use `.dockerignore` to exclude `.git`, logs, build output, and `node_modules`.",
  },
  {
    id: 'q6',
    shape: 'recommendation',
    q: 'Postgres JSONB or a separate table for user preferences?',
    base: "Usually, use a **hybrid approach**:\n\n- Put important, frequently queried preferences in typed columns or a separate table.\n- Put flexible UI settings in a `JSONB` column.\n\nExample:\n\n```sql\nCREATE TABLE user_preferences (\n  user_id UUID PRIMARY KEY REFERENCES users(id),\n  timezone TEXT NOT NULL DEFAULT 'UTC',\n  locale TEXT NOT NULL DEFAULT 'en',\n  email_notifications BOOLEAN NOT NULL DEFAULT true,\n  settings JSONB NOT NULL DEFAULT '{}'\n);\n```\n\nUse `JSONB` for preferences like dashboard layout, dismissed tips, theme details, and experimental feature settings. Use columns or normalized tables when a preference:\n\n- Must have strong validation or foreign keys\n- Is frequently filtered, sorted, or aggregated\n- Needs its own permissions or audit history\n- Can have multiple rows, such as notification rules per channel\n\nAvoid one row per key/value preference unless you genuinely need arbitrary keys; that pattern sacrifices type safety and makes queries cumbersome.\n\nRule of thumb: if application logic depends on it, give it a column. If it mainly customizes the user experience, JSONB is usually appropriate.",
    terse: 'Use a separate table for preferences you query, validate, or index; use JSONB for flexible, rarely queried settings. A hybrid, typed columns plus a JSONB `extras` field, is usually best.',
  },
];

const tok = (s) => Math.ceil(s.length / 4);

function main() {
  console.log('\ngrain terseness, across question shapes');
  console.log('='.repeat(72));
  console.log('\n  One question per turn, so the block is paid once per question.\n');
  console.log(`    ${'shape'.padEnd(22)}${'base'.padStart(6)}${'terse'.padStart(7)}${'saved'.padStart(7)}${'net'.padStart(7)}`);

  let totalSaved = 0;
  let wins = 0;
  for (const p of PAIRS) {
    const b = tok(p.base);
    const t = tok(p.terse);
    const saved = b - t;
    const net = saved - BLOCK_TOKENS;
    totalSaved += saved;
    if (net > 0) wins += 1;
    console.log(`    ${p.shape.padEnd(22)}${String(b).padStart(6)}${String(t).padStart(7)}${String(saved).padStart(7)}${String(net).padStart(7)}`);
  }

  const avgSaved = Math.round(totalSaved / PAIRS.length);
  console.log(`\n  block cost per turn        ${BLOCK_TOKENS}`);
  console.log(`  average output saved       ${avgSaved}`);
  console.log(`  average net                ${avgSaved - BLOCK_TOKENS}`);
  console.log(`  questions where it paid    ${wins} of ${PAIRS.length}`);

  console.log('\n  Output tokens bill higher than input everywhere, so a raw-token net');
  console.log('  understates it. Break-even is the ratio at which saved output covers');
  console.log(`  the block: ${(BLOCK_TOKENS / avgSaved).toFixed(2)}x. Providers charge 3x to 5x.`);
  console.log('');
}

if (require.main === module) main();

module.exports = { PAIRS, BLOCK_TOKENS, tok };
