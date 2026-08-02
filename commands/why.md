---
description: Show what grain matched on the last turn, and why
---

Run this and show the user the output exactly as it comes back:

```bash
grain why
```

Then, if they seem surprised by the result, offer the two things that fix it:

- `grain pin <mode>` forces a mode when detection keeps getting it wrong
- adding a `paths` entry to `.grain.json` routes on their own layout instead of
  on whether the request happened to use the right verb

Do not defend the routing decision. If grain picked the wrong mode, say so
plainly. The whole reason this command exists is that a tool editing every
prompt should be arguable.
