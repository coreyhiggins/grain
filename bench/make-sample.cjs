'use strict';

// Pull a stratified sample for an independent labeller.
//
// THE MISTAKE THIS NOW AVOIDS.
//
// The first version stripped the labels and kept the ids. The ids carry a
// label prefix: e0527, p0108, o0280, v0159, n0083. The labeller could read the
// answer off the front of every row, agreed with the prefix on 196 of 198, and
// said so in its report. That agreement measured nothing.
//
// Ids are now replaced with opaque keys, and the mapping back to the real ids
// is written to a file the labeller is told not to open. Position is shuffled
// too, so ordering leaks nothing either.

const fs = require('fs');
const path = require('path');

const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus-large.json'), 'utf8'));

// Deterministic, so the sample is identical for anyone re-running this.
let seed = 20260802 >>> 0;
const rand = () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const shuffle = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// Stratified, so a rare label is not represented by three prompts.
const byLabel = new Map();
for (const item of corpus) {
  const key = item.labels.length ? item.labels[0] : 'none';
  if (!byLabel.has(key)) byLabel.set(key, []);
  byLabel.get(key).push(item);
}

const PER_LABEL = Math.floor(200 / byLabel.size);
const picked = [];
for (const [, items] of byLabel) {
  picked.push(...shuffle([...items].sort((a, b) => String(a.id).localeCompare(String(b.id)))).slice(0, PER_LABEL));
}

const sample = shuffle(picked);

// Opaque keys. Sequential, so they carry no information at all.
const blind = [];
const key = [];
sample.forEach((s, i) => {
  const opaque = `s${String(i + 1).padStart(3, '0')}`;
  blind.push({ id: opaque, text: s.text, context: s.context });
  key.push({ opaque, realId: s.id, labels: s.labels });
});

fs.writeFileSync(path.join(__dirname, 'sample-blind.json'), JSON.stringify(blind, null, 1));
fs.writeFileSync(path.join(__dirname, 'sample-key.json'), JSON.stringify(key, null, 1));

// Prove the anonymised file carries no label signal.
const leak = blind.filter((b) => /^[epovn]\d/.test(b.id)).length;
console.log(`sample of ${blind.length}, ${PER_LABEL} per label across ${byLabel.size} labels`);
console.log(`ids that still leak a label prefix: ${leak}`);
console.log('mapping held back in sample-key.json');
