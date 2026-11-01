# Project Lock

## Locked gameplay scope

Melee combat is locked. Only the Shadow Snare is allowed to change.

## Locked character and interface

The Shadow hero model, HUD, and controls are locked.

The heroes (Shadow and Ghost) are locked, including their models, materials, textures, animation and the hero HD pass (`src/heroHD.ts`). Shifat, Oct 29 2026: "Heroes must be locked cause they are perfect already, don't touch without permission." Change nothing about them without his explicit permission.

## Display orientation

Landscape only. Do not add or enable portrait gameplay.

## Release rules

Use and cite real visual and motion references. Capture before-and-after screenshots for each iteration. Check both target devices—Android 10 with Chrome 155, and Windows 10 with Edge 155 on Intel UHD Graphics 600—and distinguish observed tests from estimates. Push reviewed changes directly to `main` in the existing private mirror and let its connected Vercel Git integration deploy automatically; do not invoke Vercel deployment through CLI/API or change Vercel settings. Every release report must include a changelog, a score out of 100 across visuals, controls, performance, stability, and device compatibility, plus the live link.

## Locks added Oct 30 2026 (Shifat approved)

- Name: always "Shade Verse".
- Neon Harbor night look (incl. neon glow on water) stays untouched.
- Map: Jungle Island has no bridge; the only bridge runs east, city to Neon Harbor.
- Water look: reflections subtle, blurry and blue; caustics kept; waves never tile; all water bodies share one look (`src/water/common.ts`).
- Same visuals on all devices; performance budget = Adreno 506 phone. No change that costs fps without Shifat's OK.
- Fish and sea-life shapes as of Oct 30 2026.

## Checkpoint `checkpoint-2026-10-31-water` (commit f5633ad) — LOCKED by Shifat 4:51 PM Oct 31
Restore with: `git checkout checkpoint-2026-10-31-water` (or reset main to it).
Locked looks (change only on Shifat's word):
- Water: see-through + Snell refraction, Beer-Lambert depth colour, caustics (shallow), underwater colour, submerged & mirrored heroes, Snell skyline.
- Pond: trees-only SSR, 1/8-res copy, heavy 9-tap blur (soft pink/green haze) — "Perfect".
- Far sea: flat & smooth past 260 m.
- Night sea: moon sheen + sparse glint path (masked out of Neon Harbor).
- Neon Harbor night: far towers fade into deep navy atmospheric haze (never whitewashed).
- Perf: pond SSR only within 70 m, copy every 3rd frame, 8 steps.

## Shadow style (Shifat Oct 31 9:41-9:42 PM: 'Perfect', 'Every other shadows must be like this')
All shadows are faint, wide, blurred and cool-tinted (multiply toward rgb .80/.85/.94, never black): character contact shadows, wall-foot occlusion, baked ground shade. Any new shadow must match `src/world/contactShadows.tsx`.

## Sea parity (Shifat Oct 31 10:02 PM)
Phone and desktop sea water must look exactly the same (1:1). Optimizations are fine only if they apply to every device. No device-specific water branches.
