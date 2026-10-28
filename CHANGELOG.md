# Changelog

All notable changes to the Web Swinger 3D project ("Shadow: The Soul of Darkness") are documented in this file.

## [Unreleased] - Ghost autonomous companion and human suit
### Changed
- Ghost now reuses Shadow's human body and clothing design as a feminine variant: dark suit panels are white and the lenses are hot pink. Her separate AI follows, traverses and fights alongside Shadow; shared enemies update only once. Shadow's model, spawn/follow behavior, controls, HUD, combat and landscape-only behavior remain unchanged.
### Verification
- `npx tsc --noEmit`, `VITE_DBG=1 npm run build`, and `PORT=4174 node test/ghost.mjs` pass on the exact requested baseline. Focused assertions pass at desktop 1365×768 and phone-landscape 844×390 in Chromium WebGL2/ANGLE SwiftShader, covering independent simulation, autonomous melee, follow, unchanged Shadow input, and browser errors. The SwiftShader captures were reviewed separately and are supplied with the report. Physical devices and full regression suite remain untested.

## [Unreleased] - Shadow Snare special ability
### Changed
- Shadow Snare now gathers up to five nearby eligible enemies, holds the group through an anticipation/spin, then lands a timed finisher with localized impact feedback. The ordinary melee chain, HUD, and controls remain unchanged.
### Verification
- Focused `test/snare.mjs` passed in local headless Chromium/SwiftShader at desktop-landscape and phone-landscape viewports; it checks target cap, gather/hold, impact, cooldown, normal melee-chain isolation, and browser errors. Physical Android 10/Adreno 506 and Windows 10/Intel UHD 600 runs remain untested.
- Before/after images are supplied separately with the handoff, not in this text-only commit. No Vercel settings or direct deployment operation was used; the main push is expected to use the existing Git integration, and live deployment status is not verified here.

---

## [Unreleased] - Ghost first-scene companion visibility
### Changed
- Ghost now settles beside Shadow at a short rear-quarter distance on the first gameplay frame and continues to follow smoothly. It remains automatically mounted, with no Ghost activation button; Shadow's locked model, HUD, controls, melee, and landscape-only behavior are unchanged.
### Verification
- Focused `test/ghost.mjs` passed on desktop and phone-landscape in Chromium with WebGL2 and an ANGLE SwiftShader renderer. It checks first-scene visibility/distance, absence of a Ghost activation button, follow movement, no page/console errors, and a nonblank central scene crop before writing screenshots.
- Before/after captures are committed under `art/ghost/shot-{before,after}-ghost-{desktop,mobile-landscape}.png`; all four were captured with SwiftShader and passed the nonblank guard. Physical Android 10/Adreno 506 and Windows 10/Intel UHD 600 remain untested.
- The read-only public-page check before this branch update showed Shadow but no Ghost and no client errors; its JavaScript bundle lacked Ghost component markers. This iteration is on a non-production review branch; no main merge or production deploy was attempted. Production follow-up requires direct approval; no Vercel CLI/API/settings were used.

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
