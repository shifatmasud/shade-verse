# Project Lock

## Locked gameplay scope

Melee combat is locked. Only the Shadow Snare is allowed to change.

Unlocked Nov 2 2026 (Shifat, 5:25-5:49 AM): hero melee (new hold-melee Charged Slam), hero attack animations and hero attack effects (particles, glow, trails) for BOTH heroes. Everything else in this file still holds.

## Locked character and interface

The Shadow hero model, HUD, and controls are locked.

The heroes (Shadow and Ghost) are locked, including their models, materials, textures, animation and the hero HD pass (`src/heroHD.ts`). Shifat, Oct 29 2026: "Heroes must be locked cause they are perfect already, don't touch without permission." Change nothing about them without his explicit permission.
Hero trim colour unlocked Nov 2 2026 (Shifat, 3:49 PM: "We can redesign our gold pipings to ghost & shadows colors like the illustration"): the costume's gold piping, chest emblem and buckle are repainted per hero (Shadow purple 0xa855f7, Ghost hot pink 0xff1a96, src/heroTrim.ts). Models, base suit colours, faceplates, eyes and ink outlines unchanged.

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
- Fish and sea-life shapes as of Oct 30 2026. Fish = low-poly pyramid look (5-sided cone body + 3-sided tail cone, `src/world/sealife.tsx`); Shifat Nov 1: 'old pyramid like fishes were beautiful, organic fish looks disgusting'. Never smooth them.

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

## Resolution floor (Shifat Oct 31 10:13 PM)
The world (environment) render never goes below DPR 0.8 on any device (Shifat Nov 1 2026 2:14 PM: "Min res dpr can be 0.8 for faster fps"; was 1). The fps scaler may not downscale below 0.8.

## Checkpoint `checkpoint-2026-11-02-sky` — LOCKED by Shifat Nov 2 1:01 AM ("Lock stuff now. Good enough")
Restore with: `git checkout checkpoint-2026-11-02-sky`.
Locked looks (change only on Shifat's word):
- Sky: volumetric-look cumulus with subsurface scattering, grey bases, eroded soft edges (skyFx CLOUD_GLSL, shared with the sea reflection).
- Sun: blown-out white-hot disc, golden when low, soft edge, wide glow (real sunset photo).
- Moon: Gullmarn-fjord look - glowing white disc, bright corona, big milky halo (not a detailed disc).
- Aurora v7: low wide green band, yellow-green hem, soft purplish tops (real photo /tmp/aur/4.jpg).
- Rainbow: real-photo bands + gaussian blur + warm glow.
- Sea mirrors clouds, aurora, moon, stars, rainbow; no ink outline on any water.
- Underwater: soft Snell window, TIR mirror of the seabed outside it, tall kelp forest, vent bubble columns, soft god rays, deeper caustics, thin waterline meniscus.

- Title screen locked at 4f74526 / ed378f6 (Shifat Nov 2 4:51 PM: "Perfect. Lock"). Panel art changed by Shifat himself: 5:43 PM "Use real shots from game in comic style illustration panels", then 6:03 PM "Or just ai generated image as close to real 3d as possible". The two frames now hold AI-rendered 3D-look key art (src/title/art/panel-*.webp, made from real game captures of each hero as references, tools/title/refshots.mjs + bake_panels.mjs; originals in files/title/ai_*_gi): Shadow web-swinging by the red bridge at night, Ghost firing her pink Shock lightning (no orb). The heroes live inside the frames; the separate hero cut-outs and their pop-in are gone. Title text (Shifat Nov 2 6:39 PM: tilt "feels wrong & feels disconnected from the panels"; 6:41 PM picked option 1): "SHADE VERSE" is straight (no rotate/skew) inside a black comic caption box with the frames' off-white border, tucked up over the bottom edge of both frames, centred on the seam; Play moved up under it on desktop (phone Play unchanged). Everything else on the title stays locked: layout, Anton title, round Play, symbol logo, sound toggle, timings, reduced motion, phone panel size, preloader.

## Moon — LOCKED by Shifat Nov 2 9:01 PM ("Perfect lock") at 79a2242, tag `checkpoint-2026-11-02-moon`
- Smaller soft moon disc kept under white, milky corona + wide halo, thin moonlit cloud wisps near the moon, moonlight glitter path on the sea under the real moon. Do not change moon, halo, wisps or moon glint without Shifat asking.
