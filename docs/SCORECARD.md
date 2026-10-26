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
