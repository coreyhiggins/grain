---
description: Pin a grain mode, or go back to auto-detection
---

The user wants to control which guidance grain injects instead of letting it
detect.

If `$ARGUMENTS` names a mode, pin it:

```bash
grain pin $ARGUMENTS
```

If `$ARGUMENTS` is empty, `auto`, `off`, or `none`, return to auto-detection:

```bash
grain unpin
```

Available modes are `engineering`, `orchestration`, `prose`, `design`, and
`verification`, plus any custom mode defined in a trusted `.grain.json`. Run
`grain pin` with no valid mode to have it list them.

Pinning persists across sessions until unpinned, which is deliberate: someone
who pinned a mode was correcting a wrong guess, and having that quietly expire
would repeat the mistake. Tell the user it stays until they undo it.
