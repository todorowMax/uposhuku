---
paths: ["**/components/**/*.tsx", "**/components/**/use-*.ts", "**/app/**/*.tsx", "**/app/styles/**", "**/lib/ui/**"]
trigger: adding or changing a screen, panel, sheet, dialog, popover, or any animation
---
# UI flow and motion

Source of truth: `DESIGN.md`, sections "Шари: екран, шторка, на місці" (which layer) and "Motion" (scale, situation table, where things live). Presets: `lib/ui/transitions.ts`; numbers: `lib/ui/motion-tokens.ts`.

- FLOW-1. Before coding a new surface (screen, panel, sheet, dialog, popover) or a new trigger for one, write the flow brief below into the task document. A change inside an existing surface that keeps its open and close behaviour needs no brief.
- FLOW-2. Answer each question from `DESIGN.md` or from the owner's words. If an answer is not there and a wrong guess would change what the owner sees (a new place on screen, a morph, a blocked map), ask the owner before coding: at most four questions, each with a recommended option first. Record the answers under Decisions.
- FLOW-3. Take durations and easings from the scale; never write a new number or `cubic-bezier` in a component. A value that is missing goes into `app/styles/tokens.css` and `lib/ui/motion-tokens.ts` in the same change (a test compares them).
- FLOW-4. Use a preset from `lib/ui/transitions.ts` when one fits; a movement that repeats in a second place becomes a preset there, not a copy.
- FLOW-5. Every surface that animates in also has a defined way out: the same edge, `exit` duration, focus returns to the trigger. Legacy panels without an exit are listed in `DESIGN.md` under "Поточний стан"; add the exit when you touch one.
- FLOW-6. A file you touch moves to the scale: replace its own durations and easings with the tokens, and update "Поточний стан" in `DESIGN.md` in the same change.

## Flow brief (copy into the task document)

1. Trigger: which control opens it, where it sits, and what it shows while the surface is open (hidden, pressed, badge).
2. Layer: screen, sheet or in place on phone; panel, dialog or popover on desktop (table in `DESIGN.md`).
3. Place: which slot from "Де що живе" it takes; what stays visible and usable next to it (map, chat, dock).
4. Open: morph or layer entry. Morph only when all three hold: it grows from where the trigger stands, the trigger is not needed while it is open, closing returns it to the trigger.
5. Close: every way out (button, Escape, tap outside, swipe, system back), where focus goes, what happens to unsaved input.
6. Inside: what scrolls (one axis, one scroller), what is pinned, empty, loading and error states.
7. Other surfaces: what it closes or pushes when it opens, what happens when another one opens over it.
8. Phone and input: 375 px layout, touch without hover, keyboard path with a visible focus ring, trackpad and mouse wheel (no horizontal scroll that a wheel cannot drive without arrows or drag).
9. Reduced motion: what remains when movement is removed.
