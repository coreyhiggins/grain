---
name: design
description: Work an interface through the decisions in the order they have to be settled, from what the screen is for down to contrast, responsive rules, and copy. Use when designing, redesigning, reviewing, or polishing any UI, layout, component, palette, type scale, dark mode, empty state, or accessibility pass.
---

# Design, in decision order

The order is the whole method. A palette question cannot be settled before the
hierarchy question, and hierarchy cannot be settled before anyone has said what
the screen is for. Work top to bottom. When a lower gate will not resolve, it is
usually because a higher one was skipped.

Every item here is a yes or a no. An item you cannot answer is the finding.

| # | Gate | The question it settles |
|---|---|---|
| 1 | Purpose | What this screen is for |
| 2 | Hierarchy | What gets seen first, and what never competes |
| 3 | Floors | What is not negotiable, in numbers |
| 4 | Responsive | What happens when the space changes |
| 5 | Tells | What marks it as unconsidered |
| 6 | Copy | What the words do |
| 7 | Stop | Whether more work is still work |

## 1. What is this screen for

Most bad interfaces are an unsettled answer here, dressed up as a layout
problem. Settle it in writing before anything visual.

- [ ] Can you state the one job of this screen in a sentence containing no "and"?
- [ ] Can you name the single action you most want a user to take?
- [ ] Do you know what happens if the user does nothing, and whether that is safe, costly, or irreversible?
- [ ] Do you know who arrives here, from where, and what they already know?
- [ ] Does every element on the screen serve one of the four answers above?

If two people answer the first question differently, stop designing and settle
that first. Nothing below has a correct answer until it is settled.

## 2. Hierarchy before decoration

Rank the content, then spend the tools on the ranking. Use them in this order:
**size, weight, position, contrast.** Color comes last, because it is invisible
to some users and stops discriminating for everyone once there are five of it.

One primary element. At most two secondary. Everything else is tertiary and
should look it.

- [ ] Can you list what must be seen first, what second, and what must never compete?
- [ ] Blur the screen to about 10px: is the primary element still the first thing you see?
- [ ] Is there exactly one primary action in view?
- [ ] Does the hierarchy survive a grayscale screenshot?
- [ ] Does spacing do the grouping, so related things sit closer than unrelated ones?
- [ ] Is there one type scale and one spacing step (multiples of 4 or 8) used across the whole screen?
- [ ] Could you delete every shadow, border, and gradient without changing what gets noticed first? If yes, delete them.

## 3. The floors that are not negotiable

These are measurements, not preferences. Failing one is a defect. Measure the
rendered pixels, not the token values, because a token that passes on white
fails over a hero image.

| Floor | Threshold | How to check |
|---|---|---|
| Body text contrast | 4.5:1 against its actual background | Contrast checker on the rendered pixels, including over images, gradients, and video |
| Large text contrast | 3:1 at 24px, or 18.66px bold | Same, at the real rendered size |
| Non-text contrast | 3:1 for icons, form borders, focus rings, chart segments, and any graphic carrying meaning | Same, against every adjacent color |
| Focus indicator | Visible on every interactive element, at least 2px thick, 3:1 against both the component and the background | Tab through the screen with no mouse |
| Focus not obscured | The focused element is never covered by a sticky header, footer, drawer, or cookie bar | Tab through with all sticky elements present |
| Hit target | 24x24 CSS px minimum, 44x44 for touch surfaces and for anything destructive | Measure the clickable box, not the glyph inside it |
| Target spacing | Adjacent small targets are separated so their 24px circles do not overlap | Measure gap between centers |
| Keyboard | Every action reachable, operable, and escapable by keyboard, in an order that matches the visual one | Tab from the top, then shift-tab back |
| Text zoom | 200% text size loses no content and clips nothing | Browser zoom to 200% |
| Reflow | Usable at 320px equivalent width with no two-dimensional scrolling | 400% zoom at 1280px wide |
| Text spacing | Survives line-height 1.5, paragraph spacing 2x, letter spacing 0.12em, word spacing 0.16em | Apply the overrides in devtools |
| Motion | `prefers-reduced-motion: reduce` removes non-essential movement, parallax, and autoplay | Turn the OS setting on and reload |
| Flashing | Nothing flashes more than three times per second | Watch the transition frame by frame |
| Auto-motion | Anything moving, scrolling, or updating for more than 5 seconds can be paused | Look for the control |
| Color alone | No state (error, required, selected, status) is signalled by color only | Grayscale screenshot |
| Names | Every input has a programmatic label, every image has a decided alt, decorative images have an empty one | Read the accessible name of each control |

Four things to have actually done, not intended to do:

- [ ] Did you measure contrast on the rendered pixels rather than the palette file?
- [ ] Did you tab the entire screen once with no mouse?
- [ ] Did you load it once with reduced motion enabled?
- [ ] Did you load it once at 200% and once at 320px equivalent?

## 4. Responsive behaviour as a rule

A breakpoint list records what already happened. A rule tells you what happens
at the width nobody tested. Give every element exactly one behaviour and write
it next to the element.

| Behaviour | Use for | The rule |
|---|---|---|
| Reflow | Layout containers, card grids, form rows | Columns collapse to one in reading order, and the reading order stays the DOM order |
| Truncate | Single-line labels whose full value appears elsewhere | Never the only copy of a value, and always recoverable on hover, focus, or tap |
| Scroll | Tables, code blocks, wide diagrams, timelines | Inside its own container, never the page body |
| Hide | Secondary affordances that exist somewhere else | Never the primary action, never the only route to a feature |

The one absolute: **the page body never scrolls horizontally, at any width.**

- [ ] Does every element have exactly one of the four behaviours named?
- [ ] At 320px, does the page body scroll horizontally? This must be no.
- [ ] At 320px, is the primary action present, reachable, and large enough to tap?
- [ ] Does any text truncate where the full value appears nowhere else? This must be no.
- [ ] Do wide tables, code blocks, and diagrams scroll inside their own container?
- [ ] Is body copy held between roughly 45 and 75 characters per line at every width?
- [ ] Does the layout hold with the longest real value you expect, not the sample one?

## 5. The tells that mark generated UI

Read each row against the screen in front of you and answer yes or no. Every yes
has a fix beside it.

| Tell | Fix |
|---|---|
| Every gap is the same value, so nothing groups | Rhythm comes from ratio. Space inside a group tighter than space between groups, section breaks larger again. Three or four steps in play, not one. |
| Three cards of identical weight and identical copy length | If one matters more, make it larger or first, and let the copy lengths differ honestly. If they truly are equal, a list says so with less furniture. |
| Gradient on every surface | One gradient, on the one surface that needs depth. Everything else flat. |
| A drop shadow at every level | Two elevations, resting and raised. A shadow claims "this floats above that". If everything floats, nothing does. |
| Centred text in blocks longer than two lines | Start-align body copy. Centring is for headings, short labels, and single-line empty states. |
| Icons picked because a row looked bare | Every icon names a thing or an action. If you cannot say what it means with the label covered, delete the icon and keep the label. |
| Emoji as section markers | Use type hierarchy for sections. Emoji renders differently on every platform, carries a tone you did not choose, and gets read aloud by screen readers. |
| Six accent colors | One accent. One neutral ramp. Semantic colors only where they report state. |
| Copy like "Seamlessly manage your workflow" | Name the thing it does: "Track every order in one list." A sentence that fits any product describes none. |
| Placeholder text standing in for a label | Label above the field. A placeholder vanishes the moment somebody types, which is when they need it. |
| A border around every element | Borders separate. Where space already separates, a border is noise. |
| Lorem ipsum surviving into review | Real content, or the longest and shortest values you actually expect. A layout that only works with even text does not work. |
| A hover state as the only affordance | Touch has no hover. State must be visible at rest, and duplicated in focus. |

None of these is wrong in isolation. One gradient is a choice. Gradient
everywhere is the absence of one, and that is what reads as generated: not any
single element, but the evenness that shows nothing was ranked.

## 6. Copy is part of the design

Words are interface. They are also the cheapest thing to fix and the most
frequently shipped wrong.

| Instead of | Write |
|---|---|
| Submit | The outcome: Send invite, Save changes, Delete account |
| OK and Cancel on a destructive dialog | The two outcomes: Delete file, Keep file |
| Oops! Something went wrong | What failed and what to do: "Could not save. Check your connection, then try again." |
| Error 500 | The same, in the user's terms, with one retry and one way out |
| Are you sure? | The scope and the reversibility: "Delete 4 files? This cannot be undone." |
| Please enter a valid email | What valid means here: "Include an @ and a domain, like name@example.com" |
| An empty grey box | What belongs here, why it is empty, and the one action that fills it |
| Field names from the schema | The words the user would say out loud |

- [ ] Does every button name its outcome, understandable with the surrounding text covered?
- [ ] Does every error message say what to do next, not only what failed?
- [ ] Does every empty state teach what belongs there and offer one action?
- [ ] Does every destructive confirmation state the scope and whether it can be undone?
- [ ] Is there any sentence on this screen that would fit an unrelated product? This must be no.
- [ ] Does the error text appear next to the thing that failed, rather than only at the top?

## 7. When to stop

Polish changes what a user can do or notice. Procrastination changes what you
notice. The test is whether you can name the user-visible problem the change
fixes.

**Keep going while any of these is true:**

- [ ] A floor in section 3 fails.
- [ ] Someone who had not seen the screen could not find the primary action.
- [ ] The layout breaks at 320px, at 200% zoom, or on real content.
- [ ] A destructive action has neither a confirmation nor an undo.

**Stop when all of these are true:**

- [ ] Gates 1 through 6 pass on real content, in every theme that ships.
- [ ] One person who had not seen it found the primary action without being told.
- [ ] Nothing left on your list is required by a floor or requested by a user.

**Stop anyway when any of these is true:**

- [ ] You have reversed the same decision twice. Keep the first version.
- [ ] Your last three changes are indistinguishable in a side-by-side at 100% zoom.
- [ ] You are adjusting values by a pixel or two percent and cannot say what it fixes.

## What this gate list is and is not

It is a process, and the claim it makes is a process claim: the steps run in a
fixed order, and every item is something a second person can check and dispute
with evidence. It does not decide taste, and running it does not by itself make
a design good.

When your judgement and a checklist item disagree, follow your judgement and
say which item you overrode and why. An item skipped silently reads exactly
like an item that passed, which is the one failure this list cannot catch.

Report what you measured and what you did not. An unchecked floor is not a pass.
