#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { decide } = require('../src/prompt-hook');
const { route } = require('../src/route');

// Does carrying the mode across a follow-up actually help?
//
//   node bench/followups.js [sequences.json]
//
// The routing corpus scores one prompt at a time, which cannot answer this:
// "yeah do it" has no discipline in its own text, and that is the entire
// point. So this runs whole conversations turn by turn through the real hook,
// with a real session id, and compares two things.
//
// THE BENEFIT is the easy half: how many follow-up turns get guidance with
// inheritance versus without.
//
// THE RISK is the half that matters. Inheritance is a guess about a turn the
// router cannot see, and the way it goes wrong is by carrying a stale mode
// past a change of subject. The sequence corpus marks which conversations
// change topic, so leaks are counted directly rather than assumed absent.
//
// Ground truth is deliberately thin here. These turns are not labelled one by
// one, because labelling "do it" in isolation is the thing that cannot be
// done. What is measured is coverage and leakage, and nothing is claimed
// about whether the inherited mode was the ideal one.

// Conversations the corpus author wrote as changing subject partway through.
const SHIFT = /^c(2[6-9]|3[0-9]|4[0-5])$/;

function run(sequences, now = 1700000000000) {
  const stats = {
    conversations: sequences.length,
    followups: 0,
    servedWithout: 0,
    servedWith: 0,
    inherited: 0,
    leaks: [],
  };

  sequences.forEach((conv, c) => {
    const sessionId = `bench-${conv.id}-${c}`;
    let lastExplicit = null;

    conv.turns.forEach((turn, i) => {
      const at = now + i * 1000;
      const explicit = route(turn.text);
      const output = decide({ prompt: turn.text, session_id: sessionId }, { now: at });

      if (i > 0) {
        stats.followups += 1;
        if (explicit) stats.servedWithout += 1;
        if (output) stats.servedWith += 1;

        if (output && !explicit) {
          stats.inherited += 1;

          // A leak is an inherited mode that the conversation goes on to
          // contradict: the next turn carrying a real signal names a
          // different discipline than the one being carried forward.
          if (SHIFT.test(conv.id) && lastExplicit) {
            const next = conv.turns.slice(i + 1).map((t) => route(t.text)).find(Boolean);
            if (next && next.mode !== lastExplicit) {
              stats.leaks.push({ id: conv.id, text: turn.text, carried: lastExplicit, became: next.mode });
            }
          }
        }
      }

      if (explicit) lastExplicit = explicit.mode;
    });
  });

  return stats;
}

function main() {
  const file = process.argv[2] || path.join(__dirname, 'sequences.json');
  const sequences = JSON.parse(fs.readFileSync(file, 'utf8'));
  const s = run(sequences);
  const pct = (n) => `${Math.round((n / s.followups) * 100)}%`;

  console.log('\ngrain follow-up benchmark');
  console.log('='.repeat(64));
  console.log(`\n  ${s.conversations} conversations, ${s.followups} follow-up turns\n`);
  console.log(`  served without inheritance   ${String(s.servedWithout).padStart(4)}  ${pct(s.servedWithout)}`);
  console.log(`  served with inheritance      ${String(s.servedWith).padStart(4)}  ${pct(s.servedWith)}`);
  console.log(`  turns that inherited         ${String(s.inherited).padStart(4)}`);
  console.log(`\n  leaks past a change of subject: ${s.leaks.length}`);

  for (const leak of s.leaks.slice(0, 6)) {
    console.log(`    ${leak.id}  carried ${leak.carried} into "${leak.text.slice(0, 40)}" (topic became ${leak.became})`);
  }

  console.log('\n  A known weakness of this corpus: about half its topic-shift');
  console.log('  conversations pivot the same way, from code to a written artifact.');
  console.log('  The leak count is therefore a floor, not a full picture.\n');

  if (s.leaks.length > s.inherited * 0.15) {
    console.log('  WARNING: inheritance is carrying stale modes too often.\n');
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { run };
