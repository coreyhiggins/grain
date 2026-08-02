---
description: Turn grain off, or back on
---

If `$ARGUMENTS` is `on`, turn it back on:

```bash
grain on
```

Otherwise turn it off:

```bash
grain off
```

Off means the hook injects nothing at all: no mode guidance, no skill
suggestions, zero added tokens on every turn. It stays off until turned back
on, across sessions.

Tell the user how to reverse it in the same breath. An off switch nobody can
find the other half of is a worse experience than no off switch.
