'use strict';

// Compare the independent blind labels against the authored ones.

const fs = require('fs');
const path = require('path');

const key = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-key.json'), 'utf8'));
const blind = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-labels-blind.json'), 'utf8'));

const byOpaque = new Map(blind.map((b) => [b.id, b]));
const norm = (l) => (l && l !== 'none' ? l : 'none');

let agree = 0;
const confusion = new Map();
const disagreements = [];

for (const k of key) {
  const b = byOpaque.get(k.opaque);
  if (!b) continue;
  const authored = norm(k.labels[0]);
  const independent = norm(b.label);
  if (authored === independent) agree += 1;
  else {
    disagreements.push({ authored, independent, confidence: b.confidence });
    const pair = `${authored} -> ${independent}`;
    confusion.set(pair, (confusion.get(pair) || 0) + 1);
  }
}

const total = key.length;
console.log(`\n  independent labeller vs authored labels`);
console.log(`  ${agree} of ${total} agree  (${((agree / total) * 100).toFixed(1)}%)\n`);

console.log('  where they differ');
for (const [pair, n] of [...confusion].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(3)}  ${pair}`);
}

const lowConf = disagreements.filter((d) => d.confidence === 'low').length;
console.log(`\n  ${disagreements.length} disagreements, ${lowConf} of them low confidence`);
