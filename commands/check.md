---
description: Check prose for the fingerprints of machine writing (experimental)
---

Run grain over the files the user named. If they named nothing, check what is
staged.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/grain.js" check $ARGUMENTS
```

With no arguments, use `--staged` instead.

Then do three things, in this order:

1. **Show the findings as they came back.** Each one names a rule, a line, and
   a count. Do not soften them and do not add findings of your own.

2. **Say which ones you disagree with.** grain is a set of counters, not a
   judge. A colon used well is still a colon it will flag. If a finding is
   wrong, say so and say why, because a tool nobody argues with is a tool
   nobody reads.

3. **Offer to fix only the ones that stand.** Rewrite the affected sentences
   and nothing else. Never change a fact, a number, a name, or a code block
   while fixing how something reads.

If the run comes back clean, say so in one line and stop. Do not invent
suggestions to look useful.
