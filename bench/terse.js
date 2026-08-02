#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { blockFor, approxTokens } = require('../src/modes');

// Does the terseness block actually shorten anything?
//
//   node bench/terse.js
//
// caveman's whole claim is shorter output, and its own documentation concedes
// the catch: the block costs 800 to 1,200 input tokens on every turn, so on
// short exchanges it spends more than it saves. grain fires this block only on
// prompts that look like they want a short answer, which changes the
// arithmetic but does not settle it. That needs measuring.
//
// HOW THIS WAS MEASURED, and what is weak about it.
//
// The same six lookup-shaped questions were put to the same model twice, in
// two separate threads so neither answer could see the other. One arm got the
// questions alone. The other got the terseness block first. Both responses are
// committed next to this file, so the numbers below can be recomputed and the
// answers can be read to check that brevity did not cost correctness.
//
// The weaknesses, stated rather than buried:
//   - Six questions, one model, one run. This is a demonstration, not a study.
//   - The questions were chosen to be the kind this mode targets. On prompts
//     where it does not fire, it saves nothing, which is the point of routing
//     but also means this number does not generalise to a whole session.
//   - Token counts are the four-characters-per-token approximation, not a
//     tokeniser.
//   - Nothing here measures answer quality. Read the two files.

const DIR = path.join(__dirname, 'terse');

function main() {
  const baseline = fs.readFileSync(path.join(DIR, 'baseline.txt'), 'utf8');
  const terse = fs.readFileSync(path.join(DIR, 'with-block.txt'), 'utf8');
  const block = blockFor('terse');

  const rows = [
    ['baseline', baseline],
    ['with the block', terse],
  ];

  console.log('\ngrain terseness benchmark');
  console.log('='.repeat(64));
  console.log('\n  Six lookup-shaped questions, same model, two separate threads.\n');
  console.log(`    ${'arm'.padEnd(18)}${'chars'.padStart(8)}${'~tokens'.padStart(10)}`);
  for (const [label, text] of rows) {
    console.log(`    ${label.padEnd(18)}${String(text.length).padStart(8)}${String(approxTokens(text)).padStart(10)}`);
  }

  const saved = approxTokens(baseline) - approxTokens(terse);
  const cost = approxTokens(block);
  const pct = Math.round((saved / approxTokens(baseline)) * 100);

  console.log(`\n  output tokens saved     ${String(saved).padStart(5)}   (${pct}% shorter)`);
  console.log(`  block cost, input       ${String(cost).padStart(5)}`);
  console.log(`  net                     ${String(saved - cost).padStart(5)} tokens`);

  console.log('\n  Output tokens are billed higher than input on every major provider,');
  console.log('  so a net measured in raw tokens understates the real gap. That is');
  console.log('  deliberately not converted to money here, because the rate depends');
  console.log('  on a model choice this tool does not make.');

  console.log('\n  THIS BATCH NUMBER IS NOT THE DEPLOYMENT SHAPE.');
  console.log('  Six questions were asked in one turn, so the block was paid once');
  console.log('  against six answers. The hook fires per turn, so the honest test');
  console.log('  is one question and one injection. That was run separately:');
  console.log('');
  console.log('    output saved       10 tokens');
  console.log('    block cost        143 tokens');
  console.log('    net              -133 tokens');
  console.log('');
  console.log('  A block roughly seven times larger than the answer it shortens.');
  console.log('  See bench/terse/single-turn.md for both transcripts.');
  console.log('');
  console.log('  VERDICT: terseness is not routed to. Conditional injection fixes');
  console.log('  the tax a fixed block charges every turn. It does not fix a block');
  console.log('  being bigger than the thing it shrinks, which is the whole case a');
  console.log('  terseness mode exists for. It stays available behind');
  console.log('  "grain pin terse" for anyone who wants it on purpose.\n');
  process.exitCode = saved > cost ? 0 : 1;
}

if (require.main === module) main();

module.exports = { main };
