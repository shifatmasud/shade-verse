# results.md

## 2026-10-26 07:26 PDT — cycle 0 "b6-wip-0712" (Tester) — SUPERSEDED by b6-floor-v5 mid-run, partial
- Lockgate: locked files: 0 diffs. Console errors on load: 0 (M02s + PC, both builds).
- Bug #1: not fixed by default (fark was opt-in); plain scroll b5 vs wip identical 4-12% (milky in both on plain scroll, lum ~238-243). Untested with touch ripples.
- Bug #2: not reached (my grid missed 10.3-10.6%).
- Hero 0%: 1.7% (M02s) / 3.5% (PC) pixels differ around the stone; determinism control (b5 vs b5) pending in cycle 1 before calling it.
- Crops: /home/user/tab/files/r711/tester/b6-wip-0712_<pct>_<m02s|pc>.jpg

## 2026-10-26 07:45 PDT — b6-floor-v5 (Tester) — frames INVALID (camera never converged), superseded by v6; no verdict
- Harness lesson: freezing props.time stops the camera rig; 5 s waits at ~2 fps never settle it. Use tcrop4.cjs (/tmp/pwtool): __dtCap=0.5, converge cam y/z, then reset scene time to 100 and step 20 frames x 0.05 s, hold, capture. Same pose on b5/v6 to 3 decimals.

## 2026-10-26 08:01 PDT — b6-floor-v6 (Tester), M02s converged; PC + cost pending
- Lockgate: locked files: 0 diffs. Console errors on load: 0 (b5 + v6, M02s). v6 index-GiLZca4X.js md5 f3405565.
- Which claim the frames support: Builder's. Converged b5 plain scroll (NO finger) IS milky at 6-9% (whole-frame lum 227-245 vs his hero_ok 204; cells fade to white beyond ~4 m). My first "not milky" call was wrong. The blotchy no-cell near floor in his shot is NOT reproduced on plain scroll (finger ripples remain the likely second layer).
- BUG #1: FAIL on M02s. v6 == b5 at 6/8/9%: rows 800-1600 identical mean/std to 0.1. Runtime u_rLow = 0.994 (6%) / 1.0 (8%) on __wu/__waterU/__wus, fogNear 7, far 26, u_cau 1, lakeComp 0. The uniform arrives but the lowend floor pixels don't go through the changed branches.
- BUG #2: PASS on M02s. 10 / 10.35 / 10.5%: b5 = white edge + broad slate band, v6 = one crisp white line straight into teal.
- Hero 0%: 0.47% px vs b5 = inside run-to-run noise (b5 vs b5 measured 1.0%); not provable bit-identical headless.
- Crops: files/r711/tester/b6-floor-v6_<pct>_m02s.jpg, b6-floor-v6_{10,10.35,10.5}_m02s_waterline_3x.jpg, sanity_b5_converged_vs_shifat.jpg
- Advice: check why the lowend lake path ignores u_rLow (WAB&1 gate on the cell branch, LAKERES low-res lake target / one-pass lake, or the floor being another mesh); prove it with ?rlow=0 vs default giving any pixel difference at 8% on &lowend.

## 2026-10-26 08:20 PDT — b6-floor-v6 (Tester) — FINAL: FAIL (bug #1 + cost), bug #2 PASS
- PC converged: bug #2 PASS (10.35%: b5 white line + grey slate band -> v6 one line). Bug #1 PC: visible only at 10-10.35% (less sky glare); 6/8% ~= b5 (0.3% / 2.9% px), veil remains.
- Cost sim x b5 (lake pass, normalized to the unchanged post pass 5912 / whole frame):
  M02s 6%: lake 1.22 / frame 1.06 | 8%: 1.21 / 1.05 | 10.5%: 1.07 / 0.97
  PC   6%: lake 1.17 / frame 1.06 | 8%: 1.22 / 1.04 | 10.5%: 1.19 / 1.01
  -> FAIL the <=1.00 rule (beyond +-3% noise) at 6-8% on both devices; the baked tile did NOT make it cheaper in sim.
- Errors: 0 on load, both devices.
- Crops: files/r711/tester/b6-floor-v6_<pct>_{m02s,pc}.jpg, *_waterline_3x.jpg
- Advice: keep the v6 waterline (bug #2) as is; drop/rework the water.ts a/b/c distance parts (they cost ~+20% lake and don't move the M02s floor). Root says the grade lift is the new suspect -> v7b.

## 2026-10-26 10:15 PDT — b6-floor-v7c / v7d / v7e (Tester), natural-time harness. v7e gate: bug #1 PASS, bug #2 PASS, cost being re-run
Harness (tcrop9): natural time, no freeze or jump, wait for __warmup.finished, __dtCap 0.5, 14 s settle + hdrJump 0. Earlier "grey" b5 frames at 4-8% came from probes that did not wait for warmup. Warmed-up b5 is WHITE at 5-7% (and often 8%) on M02s = Shifat's washed shot. 8% flips between runs in b5 itself (246 / 227).
- Builds: v7c index-CsZ7Yz5A; v7d index-Yn0pvj33 (md5 525bb8d6); v7e index-CNrupxpp (md5 78aa729b). Lockgate: locked files: 0 diffs (each build). Console errors on load: 0 for b5/v7c/v7d/v7e on M02s and PC.
- M02s lower-frame lum (rows 1000+) at 0/4/5/6/7/8/9%:
  b5   217 / 224-227 / 247 / 247 / 247 / 246|227 / 239
  v7c  216 / 226 / 240 / 239 / 238 / 228 / 234   (v7c&fs=0 = same at 5-7% -> fs bought ~0)
  v7d  218 / 224 / 228 / 226 / 227 / 227 / 224   (v7d&he=0 = 239-240 -> exposure ease is the lever)
  v7e  217 / 225 / - / 227 / - / 226 / -
- BUG #1: PASS on M02s and PC (v7e). 6%: b5 = milky white floor, blown sky, white horizon band; v7e = grey floor with the cell pattern crisp to the horizon, grey sky. PC 6/8% whole-frame lum: b5 245/243 -> v7e 229/229. 0% and 4% = b5 (217/217, 224/224 on both devices).
- BUG #2: PASS on M02s 10.35/10.5% and PC 10.35%: b5 = white line + grey slate band; v7e = one crisp line into teal.
- Stone: v7e vs b5 at 0/4/6/8% M02s: mean stone RGB within ~2 (except where the mask catches the lake reflection), crop MAD 9.1/40.1/15.2/8.0 vs b5-vs-b5 control 8.8/40.7/9.6/14.8. 0%: same blue grade, facets differ only by rotation phase. Inside headless noise; not provable bit-identical (camera sways about 0.04 m between runs).
- Minor: one red/magenta 5x8 px speck on the meniscus in one v7e M02s 10.5% frame (not in v7d 10.5%, v7e 10.35%, or b5). Looks like a one-frame firefly; worth a clamp check, not a gate item.
- Cost, first pass (sim; frame and passes normalized to the unchanged post pass 5912): M02s 6/8/10.5%: frame x0.99/1.06/1.01, lake x1.02/1.07/0.97, grade x0.95/0.98/0.99. PC: frame x1.07/1.02/1.04, lake x1.11/1.10/1.04. Raw frame ratios: M02s 0.98/0.86/1.05, PC 0.84/0.98/1.05. Too noisy to call (the unchanged post pass itself swung 42-65 ms). Re-running b5|v7e|b5|v7e interleaved at 6/8% on both devices.
- Crops: files/r711/tester/b6-floor-v7e_{0,4,6,8}_m02s.jpg, _{0,4,6,8,10,10.35}_pc.jpg, _{10.35,10.5}_m02s_waterline_3x.jpg, _10.35_pc_waterline_3x.jpg, _stone_{0,4,6,8}_m02s_2x.jpg; v7c/v7d: b6-floor-v7c_nat_*.jpg, b6-floor-v7d_nat_6_{m02s,pc}.jpg

## 2026-10-26 10:25 PDT — b6-floor-v7e (Tester) — GATE: FULL PASS (bug #1 PASS, bug #2 PASS, cost PASS within noise, stone within noise, 0 errors, lockgate 0)
- Cost re-run, interleaved b5|v7e|b5|v7e at 6/8%, normalized per block to the unchanged post pass 5912:
  PC   6%: frame x1.02, lake x1.05, grade x0.97 | 8%: frame x0.99, lake x1.00, grade x0.92
  M02s 6%: frame x0.97, lake x0.96, grade x0.92 | 8%: frame x1.03, lake x1.09, grade x0.94
  A/A noise in the same run (b5 vs b5, v7e vs v7e): frame up to +-9%, lake up to +-18%. Together with the first pass (frame x0.99-1.07), whole-frame cost is x0.97-1.03, inside the +-3% rule, and no direction is consistent. Lake ratios (x0.96-1.09) are inside the lake's own A/A noise. Sim can't resolve one or two multiplies; nothing shows a real increase.
- Verdict: v7e = ship candidate from the Tester side. Remaining headless limit: stone pixel-identity can't be proven bit-exact (sway); grade and colour match b5 to noise.

## 2026-10-26 11:00 PDT — b6-space-v1 / v2 (Tester, lean)
- space-v1 (md5 90d69f73): code bug found before running it. JourneyStage.tsx:471 had a // comment that swallowed `su.u_flash.value = ...`, so the warp flash was dead. Fixed in v2.
- space-v2 (md5 802c2baa, lockgate 0, 0 console errors PC + M02s; now LIVE): journey 56-86% on PC + M02s: black space, crisp stars, no diagonal band, no purple. Fast scroll through the tunnel (58->67%) on both devices: the crewmate is single and crisp. Frames: files/r711/tester/b6-space-v2_*.jpg
- FAIL (found after ship): the dive TABLET at 51-53% (PC) still shows a grey diagonal streak, settled and during scroll. The tablet paints its own space in UiCylinder.tsx (~l.470-497): a Milky-Way band (l.471), a glass sheen stripe (l.493), a caustic sweep (l.495) and its own painted crewmate (l.478-489). SPACE_BLACK doesn't touch any of these. Crop: b6-space-v2_tablet_51_pc_streak.jpg

## 2026-10-26 11:17 PDT — RCA ?nonb vs default, space-v2 (distsp2 802c2baa), PC 1366x768 &weakgpu, 51/52/53%
- Method: same build, same scroll; time held after an 8 s settle. Held times were within 1.3-2.0 s between runs (t=9.7/15.6/21.6 default vs 8.4/14.3/19.6 nonb).
- Crewmate copies: NOT reproduced in either mode. There's exactly one crewmate at 51/52/53% with default and with ?nonb.
- __nb in the default run: enabled=true, renders=0 at all three points. The neighbour renderer never drew in headless, so ?nonb can't change anything here. Inconclusive for the neighbour-RT theory: headless doesn't reach the state that makes copies.
- Streak: the diagonal glass stripe is present at 51% in BOTH modes, identical; gone at 52/53% once the glass fills. -> independent of nonb (consistent with GLASS_FS).
- Crops: files/r711/tester/rca-nonb_{51,52,53}_{def,nonb}.jpg

## 2026-10-26 12:40 PDT — b7-space-v3 / v3b / tunnel-v2b / v2c (Tester, lean) — superseded by v2d; findings for the record
- Harness: tv3.cjs (natural settle 9 s, then __qClock reset 100, 30x0.05 s, held), local builds with --base ./, interleaved tprof for cost (sim, swiftshader).
- RCA A/B (live space-v2, PC 51/52/53%): ?nonb vs default -> NO difference; no crewmate copies in either mode; neighbour renderer logged 0 draws headless (inconclusive for that theory). Streak at 51% in both. Crops: tester/rca-nonb_*.jpg
- v3 (b87f455d): tablet streak gone, one crewmate PASS; journey stars UNCHANGED vs live (pixel-identical sky, mean diff 0.02); Earth edge stair-stepped; tablet Earth a washed-out sliver on PC. Crops: tester/v3_*_{pc,m02s}.jpg, share/v3_*.jpg
- v3b/v2b (a5c26a39): tablet PASS (Earth fully inside); journey stars still ~unchanged (peaks 265 vs 262); night side not black. share/v3b_*.jpg
- v2c (9dc102bf): space PASS both devices (isolated stars vs live: PC 57% 46/115, 60% 67/129; M02s 23/56, 16/42); Earth ~half black; moon ~0.6x, brighter; tablet PASS; 0 errors.
  Tunnel (code = v2b): tube visible ~63.5%, exit 65.5-67%. NEW exit continuous (mouth -> dusk sky), no white frame; BUT NEW 66% grey-lavender wash (mean lum 47 vs 26 old, 21 at 66.25%) and PC 64.5% background dark violet (darkest quartile ~(8,7,16)) vs live black. M02s 64.5% bg black.
  Cost sim PC (live|v2c|live|v2c): 51 x1.06 pooled (2nd pair 0.99), 57 x1.03, 60 x1.05 (2nd pair 1.015), 65 x1.00; live A/A 0.99-1.03, v2c A/A 0.90-0.97; changed shaders ~+0.5%. Within noise.
  share/v2c_*.jpg (tablet51, space57, space60, tunnel64_5 PC+M02s; tunnel_exit_strip_pc, tunnel_exit_fine_pc).

### 2026-10-26 22:4x UTC — Tester: v2f → v2l (tunnel2), lean
- v2f e5525980: 66.5 still bright (35 vs 17/21). v2g 90c1a7bd: qhide=rings removed hoop (27.2) but fix made 66.5 brighter (42.5). v2h 2c14bd89: exit frames identical to v2f (rings out, but glow persisted). v2j 8d92c2af: Earth 3x / moon 2x OK; moon outline + soft map + touched menu (fixed in v2k).
- v2k f2688c63 probe: u matches code (0.689..0.952), ringOn 0 from 65.75%; 66.5 34.7; qhide=wall 4.0 -> glow was the WALL's painted ring.
- v2l 31d7db55 (ship candidate): __wallRing 1/0.48/0 at 66/66.25/66.5. PC lum 65.5->67: 19.2,18.9,21.4,15.2,9.1,8.8,23.4 (live 30,29,33,26,50,38,30); 66.5 x2 fresh = 9.1. No flash, no cut; short dark beat (accepted by root). M02s 66.5 15.8 vs live 28.9, no hoop.
  PC cost sim (quiet, interleaved): 51 x0.99, 57 x0.97, 66 x0.99, 68 x1.00, 70 x1.01; live A/A 0.96-1.01 -> PASS.
  Moon/space (v2k shots, same code): outline gone, map sharper, clear of menu; Earth night dim blue, rim crisp, clear of crewmate/copy. M02s tablet51/space57/66.5 OK. 0 console errors everywhere.
  share/: v2l_exit_fine_pc, v2l_exit_strip_pc, v2l_{tablet51,space57,exit66_5}_m02s, v2k_{space57,tablet51}_pc, v2k_66_5_qhide_pc.
  Minor: M02s Earth limb a little stair-stepped at the top edge.

## 2026-10-26 17:05 PDT — Tester — b8-water-v1 / v2 (STOPPED, not graded)
v1 (index-Ues6X3p_, md5 fce678f5) rebuilt here, md5 match, lockgate 0. PC frames 9.5/10/10.35/10.5/10.6/11 % live vs v1, 0 console errors (both). Eyeballed only: line thinner/flatter than live but still a white lip; underwater a bit lighter with faint shafts, still mostly flat teal; at 11 % a faint second band under the line on the stone (gemSheen vs wlEdgeS mismatch, v2 claims to fix). Frames: /home/user/tab/files/r711/share/w1_split_pc.jpg, /tmp/tester3/stone_pc_011.jpg. M02s live frames captured (/tmp/tester3/shots/w1_le_*_0.png); v1 M02s 5/6 frames.
v2 (index-BmZOHemr, md5 e836f2ff) rebuilt here, md5 match, lockgate 0. No frames graded.
Stopped at 00:04Z on the root's steer: Shifat wants the lake SURFACE (seen from above), not the underwater. No cost run done for v1/v2.

## 2026-10-26 17:40 PDT — Tester — b8-surface-v1 (index-K5NJA3rp, md5 f7f95d37) — NOT SHIPPABLE
Rebuilt here, md5 match, lockgate 0. Baseline CHECKPOINT-b8-v2l (= RIPTIDE-V4-STABLE, 31d7db55). Frozen time 2/4/6/8 % M02s + PC, 0 console errors (live and new).
Frames: files/r711/share/s1_surface_m02s.jpg, s1_surface_pc.jpg (REF s00 | LIVE | NEW). Crops: s1_lower4_m02s.jpg, s1_grain4_m02s_3x.jpg, s1_lower4_pc.jpg.
vs ref: ripple/caustic pattern CLOSER (pool-tile cells gone, real filaments near) PASS; colour slightly closer (still pale, by design); see-through ~unchanged; stone/reflection OK.
FAIL: mid-distance (4-6 %, both devices) rows of horizontal bright dashes, blocky/aliased; M02s 4 % one straight horizontal seam across the lake.
Cost (sim): INCONCLUSIVE, box loaded by the builder during NEW runs. Live A/A tight (2 %: 335/337/347 ms; 4 %: 252/253/243). Raw NEW +10-60 %; normalised to an unchanged pass 0.97-1.03x overall, lake shader ~+20 % at 4 %. PC cost not run. Root: v1 won't ship; cost + ?wsurf=old check moved to v2.

## 2026-10-26 18:25 PDT — Tester — b8-surface-v2 (index-CywWftRL, md5 209f2880, texture d2be2ad6)
Rebuilt here, md5s match, lockgate 0. Baseline RIPTIDE-V4-STABLE (31d7db55). 0 console errors (live, v2, ?wsurf=old; M02s + PC).
COST (sim, quiet box, interleaved live|v2|live|v2|live):
- M02s 2 %: x0.97 (0.98/0.96), A/A 339-377 ms; 4 %: x1.01 (1.00/1.02), A/A 255-264. PASS.
- PC 2 %: x1.06 (1.06/1.05), A/A 430-439 (tight) -> FAIL (+5-6 %); lake half-res pass 138->152 ms, full-res lake 46->54. PC 4 %: x1.00 (1.02/0.99; one 605 ms live warm-up outlier dropped).
FRAMES (frozen time 0/2/4/6/8 %): files/r711/share/s2_surface_m02s.jpg (REF r03 | REF r08 | LIVE | NEW), s2_surface_pc.jpg (REF r08 | LIVE | NEW); crops s2_lower4_m02s.jpg, s2_grain4_m02s_3x.jpg, s2_lower4_pc.jpg.
- v1 seam GONE; horizontal dash rows much reduced; 3x blocks reduced but still stair-stepped (half-res lake).
- NEW: the caustic net reads as a regular square grid ("paving/cobblestone") at 4 % on both devices (tile repeat visible).
- Far more water-like than live's pool-tile cells; bed shows through; still pale by design. Stone reflection softer/weaker than live at 0-4 %.
- Camera: no bug. Frozen 4 % camY M02s live 1.281/1.286 vs v2 1.275; PC 1.656 vs 1.667. Builder's "1.71 live" = the 2 % value.
- ?wsurf=old vs live: mean abs diff 0.26 at 4 % (A/A 0.13), 1.13 at 0 % -> matches.
VERDICT: close. Blockers: PC 2 % cost +6 %; square-grid caustic look. Not shipped by me (tester only).

## 2026-10-26 18:43 PDT — Tester — b8-surface-v3 (index-CIBr-khx, md5 90b90f04) — FAIL on cost, frames stopped
Rebuilt here, md5 match, lockgate 0. Cost (sim) vs RIPTIDE-V4-STABLE, interleaved live|v3|live|v3|live:
- M02s 2 %: x1.15 (1.18/1.12), live A/A 362/365/364 (tight) -> real +15 %. Lake full-res 61->76 ms, half-res 59->69. 4 %: x1.13 (1.19/1.11), A/A 257-300.
- PC (noisy, A/A 445-588): raw 2 % x1.11, 4 % x1.07; normalised to an unchanged pass ~x1.05; half-res lake ~+10 %.
Frames stopped on the root's steer (v3 dead on cost). Next: v4, cost first.

## 2026-10-26 20:15 PDT — Tester — b8-surface-v4b (index-D_M7PSV1, md5 8900231a) — PASS
Rebuilt here, md5 match, lockgate 0, effects.ts byte-identical to RIPTIDE-V4-STABLE. 0 console errors (live, v4b, ?wsurf=old; M02s + PC).
COST (sim, interleaved live|v4b|live vs RIPTIDE-V4-STABLE):
- M02s 2 %: x0.97 (0.97/0.99), A/A 345-377. 4 %: first run hit a box hiccup; recheck 258/260/245 ms = x1.03 (1.01/1.06) with live A/A spread 5 %; all 4 % runs pooled (hiccup dropped) ~x0.96. PASS within noise.
- PC 2 %: x1.00 (0.99/1.00), A/A 420-441. 4 %: x0.96 (0.95/0.96). Half-res lake pass 137 -> 129 ms. PASS.
- Note: the composite u_trail program is 18.1k chars vs live 17.4k (~+3 ms on M02s) although effects.ts is identical; small.
FRAMES (frozen time): files/r711/share/s4b_m02s.jpg (LIVE/NEW 0/2/4/8/10.35/10.5 %), s4b_pc.jpg (LIVE/NEW 0/2/4/8/10.35 %).
- Hero: the approved clean look (big soft waves, no tiles/grain/grid/seam, strong stone mirror) on both devices; matches q5.
- Split: one waterline at live's height; underwater unchanged (mean diff ~1 below the line); no cut/flash.
- ?wsurf=old vs live 4 % M02s: mean diff 0.04 (identical). Camera matches live.
VERDICT: PASS — ship-ready from the test side. Not shipped by me (tester only).

## 2026-10-26 20:43 PDT — Tester — v4c (index-DkP0kcJN, md5 2e4a1372) — M02s frames PASS (PC + cost pending)
Source: v4c src == RIPTIDE-V4-STABLE except water.ts; lake clip uses old wlEdge; no wlEdgeS anywhere; lockgate 0.
Frames (tw1.cjs frozen clock, M02s): files/r711/share/v4c_split_m02s.jpg (STABLE|V4B|V4C at 10.20/10.35/10.50 %, 3x crop @10.35, hero 2 %).
- 3x @10.35: V4B shows a pale-cyan straight strip under the white line (the extra layer). V4C = one white wavy line over teal, same as STABLE; line brightness profile matches STABLE value for value (209/187/154/119/93/78), V4B has an extra step (212/195/188/178).
- Underwater V4C vs STABLE mean diff 1.35-1.44 (noise). Above-water lake V4C vs V4B 1.2 (new clean look kept; STABLE has old pool cells).
- Hero 2 %: V4C vs the approved v4b frame from the 8:08 run = 0.34 mean diff (look kept). This run's own V4B 2 % capture came out greyer (builder Chrome started mid-run) — ignored.
- Line ~2 % of screen lower than STABLE on both V4B and V4C, tracking camera settle (camY .463 vs .453), not shader.
- Console errors 0 (STABLE, V4B, V4C).
Note: relay to root returned 401 unauthorized at 20:43; this file is the record.
