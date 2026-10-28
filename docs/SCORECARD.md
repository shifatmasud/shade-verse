## Boss arena and Ghost traversal/morph update — provisional 83/100
- Visuals: 18/20 (the phone-landscape capture shows the saturated red rooftop beacon and boss; the matched capture shows Ghost's pink-white particle re-form)
- Controls/behavior: 24/25 (focused assertions confirm Ghost shares Shadow's wall, swing, and glide modes; the fixed boss remains on its assigned roof)
- Performance (estimate): 15/20 (bounded 96-point morph cloud and a small marker scene graph; SwiftShader is not a target-device FPS result)
- Stability: 14/15 (type-check, production build, existing Ghost/boss tests, and new focused phone-landscape tests pass; full regression suite not run)
- Device compatibility (estimate): 12/20 (physical Android and Windows tests remain untested)
Evidence: `test/ghost-traversal.mjs` and `test/boss-arena.mjs` PASS at phone-landscape 844×390 in Chromium WebGL2/ANGLE SwiftShader. The first checks same-wall attachment, swing, glide, and particle out/in states; the second checks the roof-contained boss, 84 m red beam, and rooftop ring. Captures: `art/ghost/shot-before-ghost-traversal-mobile-landscape.png`, `art/ghost/shot-after-ghost-morph-mobile-landscape.png`, and `art/boss/shot-after-boss-arena-mobile-landscape.png`. Commit `01d40a7` is on the mirror's `main`; the live URL returned HTTP 200 with the updated bundle. Physical Android/Windows and target-GPU frame rates remain untested.

## Shadow-bodied giant boss revision — provisional 79/100
- Visuals: 17/20 (the actual Shadow human mesh now drives a broader athletic white body with red eyes; the accepted before/after visual pair is phone-landscape)
- Controls/behavior: 22/25 (one persistent boss and its slow pursuit/telegraphed strike remain; tests confirm ordinary melee cannot select or damage it and Shadow Snare still does)
- Performance (estimate): 14/20 (one 5,172-vertex skinned body plus its outline; SwiftShader is software-rendered evidence, not a physical-device FPS measurement)
- Stability: 14/15 (type-check, production build, and focused two-viewport assertions pass; full regression suite not run)
- Device compatibility (estimate): 12/20 (physical Android and Windows devices remain untested)
Evidence: `node test/boss.mjs` PASS in Chromium WebGL2/ANGLE SwiftShader structural and combat checks at desktop 1365×768 and phone-landscape 844×390. It checks exact 3× root scale (4.5 versus Shadow's 1.5), the 17-bone/5,172-vertex Shadow mesh, muscle-profile geometry, white material, red-eye texture pixels, boss strike, melee exclusion, and Snare target/damage with unchanged input keys. The phone-landscape capture pair is `art/boss/shot-before-shadow-body-boss-mobile-landscape.png` and `art/boss/shot-after-shadow-body-boss-mobile-landscape.png`. The desktop after-capture was blank and is not used as visual evidence; desktop rendering is unclaimed. Physical Android/Windows and target-GPU frame rates remain untested.

## Previous custom giant humanoid boss iteration — 79/100
- Visuals: 17/20 (original white muscular silhouette at 5x root scale, blank lower face and two red eyes; paired local captures reviewed at matching viewport sizes, with debug-only rooftop/camera framing in the after-images)
- Controls/behavior: 22/25 (one persistent boss, slow pursuit and telegraphed strike; plasma and Shadow Snare can hit it; ordinary melee target/damage exclusion is tested, with player input structure and timings unchanged)
- Performance (estimate): 14/20 (seven merged low-poly meshes; software-rendered desktop simulation advanced slowly, so this is a conservative code-size estimate, not a device FPS measurement)
- Stability: 14/15 (type-check, production build and focused two-viewport browser assertions pass; full regression suite not run)
- Device compatibility (estimate): 12/20 (physical Android 10/Adreno 506 and Windows 10/Intel UHD 600 remain untested)
Evidence: `test/boss.mjs` PASS in Chromium WebGL2/ANGLE SwiftShader at desktop 1365×768 and phone-landscape 844×390. It checks boss spawn/persistence, exact 7.5 root scale (five times the 1.5 hero root), red eye vertices, a wind-up and strike, Shadow Snare's target/damage path, and that an ordinary melee move neither selects nor damages the boss. After the main push, the stable public URL served the updated bundle with the boss marker. For a short smoke check, the harness advances the existing strike/Snare timers to their impact edges; it is not a full timing/soak test. SwiftShader screenshots are in `art/boss/`; physical Android/Windows and target-GPU frame rates remain untested.

## Ghost autonomous companion iteration — provisional 82/100
- Visuals: 18/20 (the same human suit silhouette now has a subtle feminine shape and white replacement panels; hot-pink lenses are assigned in the model; the captured rear-facing poses do not show the lens color clearly)
- Controls/behavior: 23/25 (independent AI, autonomous melee and follow pass the focused test on two viewports; traversal intents are implemented but not separately asserted)
- Performance (estimate): 15/20 (one additional lightweight actor simulation and skinned rig; target-GPU frame rate not measured)
- Stability: 14/15 (type-check, production build and focused SwiftShader assertions pass; full regression suite not run)
- Device compatibility (estimate): 12/20 (physical Android 10/Adreno 506 and Windows 10/Intel UHD 600 remain untested)
Evidence: `test/ghost.mjs` PASS in Chromium WebGL2/ANGLE SwiftShader at desktop 1365×768 and phone-landscape 844×390; SwiftShader captures reviewed and supplied separately with the report. The Git-triggered Vercel production deployment from `main` is READY at https://web-swinger-3d-mirror.vercel.app/.

## Shadow Snare focused iteration — provisional 82/100
- Visuals: 17/20 (five-target web gather and staged spin/kick are legible in the supplied desktop and landscape-phone captures; no physical-device visual check)
- Controls: 23/25 (existing special button and nine-second cooldown preserved; focused test confirms the regular melee chain index is unchanged)
- Performance (estimate): 16/20 (bounded five-target simulation and line geometry; target-GPU frame rate not measured)
- Stability: 14/15 (focused local Chromium/SwiftShader assertions pass on two landscape viewports; not a full regression suite)
- Device compatibility (estimate): 12/20 (physical Android 10/Adreno 506 and Windows 10/Intel UHD 600 untested)
Evidence: `node test/snare.mjs` PASS locally. Before/after screenshot files are supplied separately with the handoff; no production deployment status is claimed.

## Ghost first-scene follow iteration — provisional 81/100
- Visuals: 16/20 (original white-suited silhouette now sits beside Shadow in the first gameplay frame; captures are SwiftShader/WebGL2-verified, but physical-device appearance is untested)
- Controls: 24/25 (automatic spawn and follow; no activation button and no changes to existing controls)
- Performance (estimate): 15/20 (single low-poly follower with bounded movement math; target-GPU frame rate not measured)
- Stability: 14/15 (focused two-viewport first-scene/follow test passes with zero page/console errors; full regression suite not rerun)
- Device compatibility (estimate): 12/20 (physical Android 10/Adreno 506 and Windows 10/Intel UHD 600 untested)
Evidence: `test/ghost.mjs` PASS under Chromium WebGL2/ANGLE SwiftShader at desktop and phone-landscape sizes. `art/ghost/` contains the four before/after PNGs; their central scene crops passed the nonblank checks. The pre-fix production bundle lacked Ghost markers; this iteration was subsequently merged to `main` and is included in the READY production deployment at https://web-swinger-3d-mirror.vercel.app/.

## v0.76 - Combat Choreography Release (Score: 85/100)
- Visuals: 18/20 (tactile hit-stop frame impact weight, multi-angle strike animations, comic outlines intact)
- Controls: 23/25 (gap-closing strike lunges within 5.8m, responsive 3-hit combo cadence, fluid ground-to-combat transition)
- Performance (estimate): 16/20 (code analysis, lightweight math in sim loop, zero heavy allocations per frame; physical hardware untested)
- Stability: 14/15 (headless Puppeteer tests pass with zero console errors or uncaught exceptions across mobile and desktop)
- Device Compatibility (estimate): 14/20 (WebGL2/WebGPU features aligned with Android 10 Chrome and Windows 10 Intel UHD 600 about:gpu exports; physical device testing not performed)
Evidence: test/combat.mjs and test/fight.mjs PASS (street combat, 3-punch KO, combo lunge, hit-stop). Screenshots captured: shot-after-mobile-combat.png (249 KB), shot-after-desktop-combat.png (603 KB).

# Web Swinger scorecard (self-scored, evidence based)
Stack: React 18.3.1, three 0.169, @react-three/fiber 8.17.10, framer-motion 11, gsap 3.12, WebGL2, Vite.
Pillars (weight): Visuals 20, Swinging/controls 25, Performance 20, Stability 15, Device compatibility 20. Device numbers marked UNTESTED are not measured.

## v0.1 (49/100)
Visuals 10/20, Controls 12/25, Perf 8/20, Stability 11/15, Compat 8/20.
Evidence: local headless Chrome (software GL, 390x780): no page errors in 40 s, 50-60 fps at adaptive scale; bot chain-swung to 61 m/s. Orb pickup, human feel, Adreno 506 / UHD 600 runs: UNTESTED.

## v0.2 changes
Wind audio scaled by speed with mute, vibration on orb/attach/fall (where supported), intro zoom, letterbox menu, vignette and speed lines, favicon fix.

## v0.3 (changes + evidence)
Orbs now spawn 30-120 m from the player at swingable heights (18 live), pickup radius 5.5 m. Neon signs, roof beacons, hero details, rim light, on-screen fps/render-scale/WebGL readout (for real-device reports), tab-hidden audio suspend + input reset.
Evidence (headless Chrome, software GL, 390x780): deterministic pickup test: teleport to orb => score 0->1, time +3 s (PASS). Bot run 75 s: 43 swings, 2 orbs collected, 0 page errors (bot is crude). Soak >5 min, real device FPS, deployed page behind login: UNTESTED.

## v0.4
Warm sunset palette, per-district colors, water tanks/AC/antennas, more setbacks. Metrics use raw dt; camera pushed out of AABBs after lerp; single pixel-ratio owner; blur clears input. Pickup test PASS again (0->1). Soak/resize/orientation, device FPS: UNTESTED. Perf stays capped at 40.

## v0.5
Facade shader: smaller windows, floor bands, pilasters, glass tint. Warmer lighting. Spawn fixed: removed the tall wall in front of the start roof (start camera faced a blank neon wall). Pickup test and page errors: see report. Perf capped 40. Soak/resize/device: untested.

## v0.5.1
Blur/hidden now also clears keyboard key state. Known limitation: below ~20 fps physics dt is clamped (50 ms), so the game runs in slow motion and the round timer follows sim time, not wall time. QA (independent, software GL): orientation 390x780->900x1600 PASS, ~2.5 min wall soak heap stable (24-27 MB -> 10-12 MB after GC), full 5 min soak NOT done. Blur handling is code-level only, not browser-tested.

## v0.6
Free roam: no timer or game over (FLIGHT counter counts up), falls cost nothing, orbs +1 score. Hero: shoulder pads and chest harness. Start blocks 40-55 m for a mid-height swing corridor. Keys-clear on blur fixed in v0.5.1 (code-level only).

## v0.7
Rooftop beacons (route objective, +5 score, cyan light pillar, distance HUD). Fixed QA regressions: best score now persists on any new high (was only on game over), orb toast shows +N, fall toast no longer mentions a time penalty. Stale '+3s' pickup claims in earlier entries are obsolete: pickup adds score only since v0.6. Harness test/assert.mjs asserts orb 0->1, beacon +5, best persisted, mode stays play, no page errors: PASS (software GL).

## v0.8
Beacon: edge-aware cyan arrow marker, wider pillar. HUD chips restyled with Shade DS dark-theme tokens (own repo shifatmasud/Shade-DS, Theme.tsx surfaces #121212, borders #333, text #E0E0E0/#AAAAAA); only token values reused, no components.
Evidence (local, headless Chrome SwiftShader 390x780): 5.5 min soak (test/soak.mjs): 333 s, 214 swings, heap 9-10 MB flat with forced GC, fps 45-53 after warmup (software GL, adaptive scale), 0 page errors, mode stayed play. Audio (test/audio.mjs): no AudioContext before the Play gesture, context running after Play, wind node present, wind gain 0.008 at speed and 0 when muted: PASS. assert.mjs now also requires localStorage best. Real-device FPS and real audio output on a phone: UNTESTED.

## v0.9
Street level is now walkable (the street used to respawn you). Landing: impact scales a crouch, hard landings (>26 m/s) stun 0.45 s and cost HP. Combat: 10 street enemies (3 hp), PUNCH (J/E), DODGE (C/Q, 0.38 s invulnerability dash), enemy telegraph then swing (12 dmg), HP regen after 5 s, KO respawns at last rooftop, no game over. Beacon marker fixed for behind-camera cases (view-space test).
Evidence (local SwiftShader, 390x780): test/combat.mjs PASS (street grounded, 3 punches -> 1 KO and +2 score, undodged enemy attack reduces HP, dodge window keeps HP 100, 60 m drop = hard landing with stun and HP loss, small hop no stun, HP<=0 resets, mode stays play). test/marker.mjs PASS (toward / away / left / right). assert and audio tests PASS. Dodge test sets the invulnerability window directly after confirming the input starts it, so it is not a full end-to-end timing test. Enemy AI is basic (chase, telegraph, swing), enemies stay on streets. Real-device feel and perf: UNTESTED.

## v0.10
Hero rebuilt as a tapered V-torso, gold shoulders/gloves/boots, angled lenses, scarf tails (scale 1.35). Fixes: death check now runs before HP regen (QA: could resurrect hp 0 without respawn); street ground flag flickered every step (floor test used < instead of <=), fixed; swinging from street level now zips the hero up toward the anchor (before, the rope was slack and the hero just stood). Menu text now warns that big falls hurt and stun.
Evidence (local SwiftShader): test/motion.mjs PASS (run 11 m/s, stop <1, jump apex 2.4 m, lands, jump then swing attached, 40 m/s, release, lands) test/combat.mjs PASS incl. respawn at last roof, with longer polling. assert, audio, marker PASS. Note jump apex is 2.4 m (snappy). Real device: UNTESTED.

## Required scope (user mandate, 5:31)
UPDATE 5:37: wall crawl/run, wall jump, wall vault, higher jump (apex 4.6 m) implemented and logic-tested (test/wall.mjs PASS). Wall camera framing and pose NOT visually verified. Swimming NOT implemented.

### Original note
Wall crawling, wall walking/running, higher jump, running, swimming (ocean, split view, underwater).
Tests required before any claim: wall attach/detach, wall jump, water entry/exit, transitions ground<->wall<->swing.
Current jump apex 2.4 m (to raise). Run PASS. Wall and swim: none.
