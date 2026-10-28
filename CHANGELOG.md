# Changelog

All notable changes to the Web Swinger 3D project ("Shadow: The Soul of Darkness") are documented in this file.

## [Released] - Full-body red boss armor
### Changed
- Added 50 original, low-poly red armor plates over the existing 17-bone Shadow boss from helmet and gorget through chest/back, shoulders, arms, gauntlets, pelvis, thighs, knees, greaves, and boots. The open-faced helmet leaves Shadow's original red lens pixels unobstructed; two tiny red eye highlights make them legible at phone size. The armor is bone-attached and follows the existing heavy stride/attack.
- Kept the boss's Shadow skinned human body, exact 3× root scale, hitbox/combat rules, fixed rooftop arena and red beacon, Ghost animation parity/morphs, and the player's model/HUD/controls/melee/landscape behavior unchanged. No simulator, player, or Ghost logic was modified; the armor geometry/materials are original and use no external assets.
### Verification
- `npx tsc --noEmit`, `VITE_DBG=1 npm run build`, `PORT=4173 node test/boss.mjs` (17-bone body, 3× scale, 50 red bone-attached armor meshes, full-body coverage, eye aperture, boss strike, ordinary-melee exclusion, and Snare damage at desktop 1365×768 and phone-landscape 844×390), `PORT=4173 node test/boss-arena.mjs`, and the Ghost animation/morph/traversal regressions pass in Chromium WebGL2/ANGLE SwiftShader.
- Phone-landscape armor evidence: `art/boss/shot-after-red-armor-mobile-landscape.png` (844×390), paired against the earlier white-body view `art/boss/shot-after-shadow-body-boss-mobile-landscape.png`. Physical Android/Windows and target-GPU frame rates remain untested.
- Changes are scoped to the private mirror's `main`; no push was made to the original repository.

## [Released] - Ghost full-action animation parity and surface morph
### Changed
- Ghost now renders Shadow's shared live clip and procedural action poses for traversal, spring-shot, glide/flight, swimming/dive, dodge/roll/cartwheel, all seven melee moves, plasma web, and every Shadow Snare phase. The two-hand spring shot is driven by the real jump-from-web simulator transition and aims both hands at Shadow's anchor.
- On Shadow's ground landings and wall-crawl surface entries, Ghost finds a nearby point on the same valid support and morph-transports through the existing pink-white 96-particle effect; the fade hides relocation so it never visibly snaps. Long-distance catch-up remains intact.
- Shadow's model, HUD, controls, ordinary melee simulation, landscape-only behavior, the 3× rooftop boss, red beacon, and prior Ghost features remain unchanged; no simulation/combat rules were edited.
### Verification
- `npx tsc --noEmit`, `VITE_DBG=1 npm run build`, `PORT=4173 node test/ghost-animation-sync.mjs` (26 action cases, including dual-hand spring-shot), `node test/ghost-surface-morph.mjs` (street, park, roof, wall), `node test/ghost-traversal.mjs` (wall, swing, zip-up, glide/morph), `node test/ghost.mjs`, `node test/boss.mjs`, and `node test/boss-arena.mjs` pass in Chromium WebGL2/ANGLE SwiftShader. The phone-landscape morph capture is `art/ghost/shot-after-ghost-morph-mobile-landscape.png` (844×390).
- Legacy `test/combat.mjs` and `test/snare.mjs` fail unchanged on the exact starting commit `e3439faa` in a temporary baseline worktree (no KO/damage and Snare impact wait timeout, respectively); these are pre-existing test failures, not introduced here. Physical Android/Windows devices and target-GPU frame rates remain untested.
- Changes are scoped to the private mirror's `main`; no push was made to the original repository.
### References
- Adobe Mixamo animation workflow, Insomniac/PlayStation traversal and combat references, and the existing particle-VFX inspiration are recorded in `docs/REFERENCES.md`; no third-party code or game assets were copied.

## [Released] - Ghost traversal match, particle morph, and fixed boss arena
### Changed
- Fixed the existing white, red-eyed, 3× Shadow-body boss to a central rooftop arena, constrained its pursuit to that roof, and marked the location with a pulsing 84 m red beacon and rooftop rings.
- Ghost now follows Shadow's active wall-crawl, web-swing, and airborne/glide mode using its own simulation. Long-distance catch-up fades through a pink-and-white particle morph instead of a visible snap.
- Preserved Shadow's model, HUD, controls, ordinary melee, the boss's model/scale, and landscape-only gameplay; no normal-melee tuning changed.
### Verification
- `npx tsc --noEmit`, `npm run build`, `PORT=4173 node test/ghost.mjs`, `PORT=4173 node test/boss.mjs`, `PORT=4173 node test/ghost-traversal.mjs`, and `PORT=4173 node test/boss-arena.mjs` pass. Focused Chromium WebGL2/ANGLE SwiftShader assertions cover the existing desktop/mobile Ghost and boss checks plus phone-landscape wall/swing/glide/morph behavior and rooftop/beacon placement.
- Phone-landscape captures (844×390): baseline `art/ghost/shot-before-ghost-traversal-mobile-landscape.png`; after `art/ghost/shot-after-ghost-morph-mobile-landscape.png` and `art/boss/shot-after-boss-arena-mobile-landscape.png`. These are local browser captures, not physical-device screenshots.
- Physical Android 10/Chrome 155 and Windows 10/Edge 155/Intel UHD 600 tests remain untested. Commit `01d40a7` was pushed to the mirror's `main`; the existing Git-triggered production URL https://web-swinger-3d-mirror.vercel.app/ returned HTTP 200 and served a 200 bundle containing the new red-beacon marker.
### References
- Official Insomniac/PlayStation traversal references and the particle VFX reference are recorded in `docs/REFERENCES.md`; no source assets or code were copied.

## [Released] - Shadow-bodied giant boss revision
### Changed
- Replaced the custom boss body with Shadow's existing skinned human model and skeleton. The boss uses an exact 3× root-scale ratio (4.5 versus Shadow's 1.5), with a broadened athletic chest/arms, white-painted suit texture, and red eyes.
- Kept Shadow's model, HUD, controls, ordinary melee, Ghost behavior, and landscape-only behavior unchanged. Boss aim/collision centers now match the smaller model; ordinary melee still cannot damage it, while Shadow Snare remains the only player attack that can.
### Verification
- `npx tsc --noEmit`, `VITE_DBG=1 npm run build`, and `PORT=4173 node test/boss.mjs` pass. Chromium WebGL2/ANGLE SwiftShader structural and combat assertions ran at desktop 1365×768 and phone-landscape 844×390, checking the 17-bone/5,172-vertex Shadow mesh, exact 3× scale, white material/red-eye texture, boss strike, ordinary-melee exclusion, Shadow Snare damage, and unchanged input keys.
- Accepted visual evidence is the matched phone-landscape SwiftShader/WebGL2 pair: `art/boss/shot-before-shadow-body-boss-mobile-landscape.png` and `art/boss/shot-after-shadow-body-boss-mobile-landscape.png` (844×390). The desktop after-capture was blank, so it is excluded and desktop rendering is not claimed. These are focused smoke checks, not a full regression or timing soak.
- Physical Android and Windows testing remains untested. Pushing this revision to the mirror's `main` uses its existing Vercel Git integration; the public URL is https://web-swinger-3d-mirror.vercel.app/.
### References
- [Michelangelo's David — right view 2, Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Michelangelo%27s_David_-_right_view_2.jpg) — real sculptural reference for a broad heroic human silhouette and white finish; no photo or external model asset is included.
- [The Biomechanical Characteristics of the Strongman Yoke Walk, Frontiers](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2021.670297/full) — loaded human gait findings used as context for a short, restrained heavy stride.
- [5 Rules For Animating Colossi, GameAnim](https://www.gameanim.com/2021/09/30/5-rules-for-animating-colossi/) — smooth starts for large mass and restrained heavy-limb motion.

## [Released] - Giant humanoid boss
### Added
- An original, procedural white humanoid boss at 5x Shadow's root scale, with a muscular torso and limbs, two red eyes, and a deliberately blank lower face. Its slow pursuit and telegraphed heavy strike use the existing enemy loop; the boss is targetable by the existing plasma weapon and Shadow Snare, but excluded from ordinary melee.
- The boss uses seven merged low-poly meshes. Shadow's model, HUD, controls, ordinary melee tuning, and landscape-only behavior remain unchanged.
### Verification
- `npx tsc --noEmit`, `npm run build`, and `PORT=4173 node test/boss.mjs` pass. The focused local Chromium WebGL2/ANGLE SwiftShader checks cover desktop 1365×768 and phone-landscape 844×390, one boss plus 26 normal enemies, 5x root scale, red-eye geometry, a boss strike, Shadow Snare target/damage, ordinary-melee target/damage exclusion, and unchanged input keys.
- `art/boss/shot-before-boss-{desktop,mobile-landscape}.png` and `art/boss/shot-after-boss-{desktop,mobile-landscape}.png` are paired local captures at the same viewport sizes. The after-images use a debug-only rooftop placement and lower camera framing so the full boss fits; the live spawn remains at street level. The browser harness advances the existing strike and Snare timers to their impact edges, so this is a focused smoke check, not a timing soak or full regression suite.
- Desktop SwiftShader simulation was slow; that is software-renderer evidence only, not physical-device FPS. Android 10/Adreno 506 and Windows 10/Intel UHD 600 have not been tested. After commit `40e7899` was pushed to `main`, the stable public URL returned HTTP 200 and served `/assets/index-BUWdjKMy.js` with the `giantBoss` component marker, confirming the Git-triggered release: https://web-swinger-3d-mirror.vercel.app/. No Vercel CLI/API or settings were used.
### References
- [5 Rules For Animating Colossi, GameAnim](https://www.gameanim.com/2021/09/30/5-rules-for-animating-colossi/) — weighty acceleration and restrained heavy-limb motion.
- [The Biomechanical Characteristics of the Strongman Yoke Walk, Frontiers in Sports and Active Living](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2021.670297/full) — loaded human gait context for slower cadence and longer stance.
- [Shadow of the Colossus art gallery, Creative Uncut](https://www.creativeuncut.com/art_shadow-of-the-colossus_a.html) — scale/silhouette context; no art or model assets copied. Additional notes: `art/boss/research-notes.md`.

## [Released] - Ghost autonomous companion and human suit
### Changed
- Ghost now reuses Shadow's human body and clothing design as a feminine variant: dark suit panels are white and the lenses are hot pink. Her separate AI follows, traverses and fights alongside Shadow; shared enemies update only once. Shadow's model, spawn/follow behavior, controls, HUD, combat and landscape-only behavior remain unchanged.
### Verification
- `npx tsc --noEmit`, `VITE_DBG=1 npm run build`, and `PORT=4174 node test/ghost.mjs` pass on the exact requested baseline. Focused assertions pass at desktop 1365×768 and phone-landscape 844×390 in Chromium WebGL2/ANGLE SwiftShader, covering independent simulation, autonomous melee, follow, unchanged Shadow input, and browser errors. The SwiftShader captures were reviewed separately and are supplied with the report. Physical devices and full regression suite remain untested.
- Merged to `main`; the Git-triggered Vercel production deployment is READY at https://web-swinger-3d-mirror.vercel.app/.

## [Unreleased] - Shadow Snare special ability
### Changed
- Shadow Snare now gathers up to five nearby eligible enemies, holds the group through an anticipation/spin, then lands a timed finisher with localized impact feedback. The ordinary melee chain, HUD, and controls remain unchanged.
### Verification
- Focused `test/snare.mjs` passed in local headless Chromium/SwiftShader at desktop-landscape and phone-landscape viewports; it checks target cap, gather/hold, impact, cooldown, normal melee-chain isolation, and browser errors. Physical Android 10/Adreno 506 and Windows 10/Intel UHD 600 runs remain untested.
- Before/after images are supplied separately with the handoff, not in this text-only commit. No Vercel settings or direct deployment operation was used; the main push is expected to use the existing Git integration, and live deployment status is not verified here.

---

## [Released] - Ghost first-scene companion visibility
### Changed
- Ghost now settles beside Shadow at a short rear-quarter distance on the first gameplay frame and continues to follow smoothly. It remains automatically mounted, with no Ghost activation button; Shadow's locked model, HUD, controls, melee, and landscape-only behavior are unchanged.
### Verification
- Focused `test/ghost.mjs` passed on desktop and phone-landscape in Chromium with WebGL2 and an ANGLE SwiftShader renderer. It checks first-scene visibility/distance, absence of a Ghost activation button, follow movement, no page/console errors, and a nonblank central scene crop before writing screenshots.
- Before/after captures are committed under `art/ghost/shot-{before,after}-ghost-{desktop,mobile-landscape}.png`; all four were captured with SwiftShader and passed the nonblank guard. Physical Android 10/Adreno 506 and Windows 10/Intel UHD 600 remain untested.
- The read-only public-page check before this branch update showed Shadow but no Ghost and no client errors; its JavaScript bundle lacked Ghost component markers. That was the pre-release build: this iteration was subsequently merged to `main` with the autonomous Ghost release, and its Git-triggered Vercel production deployment is READY at https://web-swinger-3d-mirror.vercel.app/. No Vercel CLI/API/settings changes were used.

---

## [v0.77] - Flowing Combat Choreography
### Added
- 4-hit ground chain on the melee button: jab, cross, spin hook kick (full 360° turn, wide sweep), launcher (rising knee + uppercut that pops the bot into the air).
- Aerial follow-up: melee while the launched bot hangs (or while airborne) leaps after it and lands a diving spike kick that slams it into the ground (bounce, extra damage, camera kick).
- Web-pull strike: melee on a bot 6–16 m away webs it in, then a flying kick.
- Web-yank slam: web shot at a launched bot yanks it down into the street.
- Dodge is now a flip: backflip/forward roll or cartwheel by dodge direction, with a small hop; dodge cancels any strike.
- Input buffering (press during a strike, the next one starts at its cancel point), eased gap-closing lunges, per-bone pose blending (no snapping), hit-stop per move, small camera shake on impacts, bot stagger/launch/tumble/slam reactions.
### References (real stills, frame-by-frame)
- Muybridge, Two men boxing (1887): https://commons.wikimedia.org/wiki/File:Two_men_boxing._Photogravure_after_Eadweard_Muybridge,_1887._Wellcome_V0048677.jpg and https://commons.wikimedia.org/wiki/File:Two_men_in_pelvis_clothes_boxing_(rbm-QP301M8-1887-336).jpg
- Taekwondo 540 hook kick (frame sequence): https://commons.wikimedia.org/wiki/File:Taekwondo_540_Hook.gif ; Jump spin hook kick: https://commons.wikimedia.org/wiki/File:Jump_Spin_Hook_Kick.JPG ; Capoeira armada: https://commons.wikimedia.org/wiki/File:Capoeira_armada_kick.jpg
- Marvel's Spider-Man 2 gameplay still: https://en.wikipedia.org/wiki/File:Spider-Man_2_gameplay_screenshot.jpg ; Muybridge wrestling (grapple/yank weight): https://commons.wikimedia.org/wiki/File:Two_men_wrestling._Photogravure_after_Eadweard_Muybridge,_18_Wellcome_V0048678.jpg

---

## [v0.76] - Combat Choreography & Strike Lunges Release
### Added
- Insomniac Spider-Man 2 martial arts combat flow & web combo choreography (YouTube D9xHicWET3I reference at t=14.2s-15.7s).
- Gap-closing strike lunges toward enemies within 5.8m range for fluid melee transitions.
- 3-hit combo progression (jab, cross, spinning roundhouse) with scaling damage and 15 force finisher knockback.
- Hit-stop impact frame weighting (0.04s on light hits, 0.07s on combo finisher) for tactile impact punch.
- Headless combat assertion test suite in test/combat.mjs and test/fight.mjs with multi-viewport screenshot verification.

---

## [v0.75] - Commit 8f43a7f
### Added
- Bot scale increased to 1.2x hero size across civilian and enemy humanoid robots.
- Visual death explosion effect with debris and shockwave upon bot knock-out (KO).
- Semantic light tagging to exclude glowing lights, beacons, and emissives from the comic outline pass.

### Fixed
- Outline pass now respects glowing entities without producing black borders around lights.

---

## [v0.74] - Commit 4326f9a
### Added
- Screen-space comic outline shader for buildings and world objects.
- Shadow-body base topology adapted for robotic civilian crowds and armored enemies.
- Survey quad drones overhead and grounded dome robots near street level.

### Fixed
- Crowd pop-in eliminated via world-fixed street slots, distance alpha fades, and spawn grow/KO transitions.

---

## [v0.73] - Commits f4ae506, 80e2400
### Added
- Dense street robot population using Polyfork models: civilian robots (blue eyes, smooth visor faceplates, no mouths/noses, full-body covered suits).
- Heavily armored enemy units (red eyes, armor plates).
- Staggered enemy combat strikes and nearby return upon respawn.

---

## [v0.72] - Commit 78db15f
### Changed
- Traversal physics: increased top swing boost cap, glide speed (+56%), and acceleration (+21%).

---

## [v0.71] - Commit 0c55f56
### Added
- Plasma web projectile attack with aim assistance and gentle homing.
- High-impact radial shockwave explosion with enemy knockback on impact.

---

## [v0.70] - Commit 1817856
### Changed
- Minimalist in-game UI: custom action icons, zero in-game text during play, glassmorphic styling, and contextual movement-activated D-pad.

---

## [v0.65] - Commit 4f7e0d2
### Changed
- Camera system: free manual camera orbit with smart movement-based tracking (GTA-style).

---

## [v0.60] - Commit fc802bb
### Added
- High-speed swimming and underwater diving mechanics.
- Wall-running stride mechanics transitioning automatically from wall-crawling.

---

## [v0.55] - Commit 7cc76be
### Added
- Polyfork residential architecture: six-home neighborhood block with preserved foliage layout.

---

## [v0.50] - Commits e2480ec, 71bced3
### Added
- Continuous powered flight on held jump during glide or fall.

---

## [v0.45] - Commits 897550b, e66c492, b11657e, 0c6011e, 6d18999
### Added
- Realistic alpha-tested foliage for trees and bushes.
- Multi-family tree assets including pine trees with needle textures.
- Dense thin grass blades with subtle flowers and glowing fireflies.

---

## [v0.40] - Commits dbe927a, 82d1a16, f84e7ed
### Added
- Physically informed water rendering: Fresnel sky reflection, underwater refraction, foam, surface ripple rings, wake trails, and waterline split view.
- Lake environment situated beneath bridge crossing.

---

## [v0.37] - Commit 6401e56
### Added
- Custom original hero model (Shadow: The Soul of Darkness): hooded, masked, navy/gold suit, purple lenses, chest insignia, and shoulder cloth panels.
- Model and UI locked in Lock.md (cape weights open for animation).
- Initial public Vercel release at https://web-swinger-3d-eight.vercel.app/.

---

## [v0.10] - Commits v0.10
### Added
- Tapered V-torso hero mesh with gold accents, scarf tails, and angled lenses.
- Street swing vertical zip-up trajectory.
- Hard landing stun and damage scaling from fall velocity.

---

## [v0.9] - Commits v0.9
### Added
- Street-level traversal and combat system (punch, dodge dash, enemy telegraphs, HP regeneration, rooftop KO respawn).

---

## [v0.8] - Commit v0.8
### Added
- Shade DS design token styling for HUD chips and edge-aware cyan rooftop beacon navigation markers.

---

## [v0.1 - v0.7] - Baseline Foundation
### Added
- Core WebGL2 / Three.js / R3F game engine with Vite.
- Rooftop pendulum swinging physics, collectibles, daytime/sunset palette, and headless assertion harness.
