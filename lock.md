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
