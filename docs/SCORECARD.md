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
