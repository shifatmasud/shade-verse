# Changelog

All notable changes to the Web Swinger 3D project ("Shadow: The Soul of Darkness") are documented in this file.

## [Released] - Cinematic sound pass (merged with env-iter3 F)
### Added
- `src/audio/engine.ts`: one WebAudio context with world-SFX, ambience and music buses. It unlocks on the first gesture (or at load where the browser's autoplay policy already allows it), keeps the existing mute toggles (now remembered across visits), ducks to silence and suspends while the tab is hidden, caps simultaneous one-shots (8 on phones, 14 on desktop) with priority stealing, and pans positional sounds with a PannerNode on desktop or a plain StereoPanner plus distance gain on phones. There is no compressor on phones.
- `src/audio/synth.ts`: 34 procedural recipes rendered once each through an OfflineAudioContext (one at a time, lazily). They cover the beds (city hum with traffic and horns, wind, ocean waves, lake lapping, leaves, crickets, underwater, glide, swing air, unibeam loop) and the one-shots (web thwip, attach, swing whoosh, web spring, Web Shock charge and zap, punches, swish, landings, jump, splash, orb, hurt, robot metal hit and KO, boss hit and KO, title-to-play hit). It also adds the Iron Man-style repulsor charge and bolt and the unibeam charge, fire and beam.
- `src/audio/director.ts`: reads the sim each frame without changing `sim.ts`. Beds cross-fade by zone and position: city, wind rising with height and speed, ocean waves toward the shore, lake toward the pond, birds by day and crickets by night near the park and lake trees, leaves in the cherry-blossom and palm ring, and an underwater 650 Hz muffle with bubbles. One-shots fire on sim edges, and footsteps play per stride on concrete, grass or sand. Enemy hits and KOs are positional. No sirens (Shifat: "No sirens please"). The adaptive two-layer score swells with swinging and combat and calms when idle; the title theme plays on the title and game-over screens. The director also exposes hooks for the coming enemy weapons: `repulsorCharge`, `repulsorBolt`, `repulsorImpact`, `unibeamCharge`, `unibeamStart/Move/Stop`.
- `public/audio/`: footstep sprite and bird loop (both cut from CC0 freesound recordings) and an original three-file score, as Ogg with MP3 fallbacks. Sources and licenses are in `public/audio/CREDITS.md`. `tools/audio/build_audio.py` is the offline build of those files.
### Changed
- `App.tsx`: the old oscillator beeps, noise wind and water nodes are replaced by the director. The visual/haptic event code, controls, HUD and heroes are unchanged.
### Verification
- `npx tsc --noEmit` and `npm run build` pass. `test/sound.mjs` and `test/audio.mjs` pass on a `VITE_DBG=1` build at 915x412 in headless Chromium with zero page errors. They check no context before the first gesture, the score layers loading, beds per zone (street, lakeshore, ocean, high rooftop), hero edge sounds firing, the voice cap holding at 8, mute and hidden-tab suspend/resume, and render cost: all 35 recipes, 100 s of audio, in about 0.5 s on the build box.
- `test/sound-demo.mjs` renders a 42 s montage with the game's own buffers. Its mp4 is at `/home/user/tab/files/shadeverse/sound_demo.mp4`: -18 LUFS, -0.9 dBTP, no gaps. Physical-device CPU and sound remain untested.

## [Released] - env-iter3 F: Iron Man-style enemy fire + sound pass merge
### Added
- Regular enemies fire repulsor blasts from an open palm: a 0.4 s palm-glow telegraph, then a fast glowing bolt (white-hot core + cyan light trail) aimed at the hero's predicted position (led by his current velocity, so changing direction or swinging dodges it). 2–3 s cooldown per enemy, at most 3 charging at once and 0.35 s between any two shots, range 6–30 m with line of sight. 8 damage per hit (melee is 12).
- Bosses fire 3-shot repulsor volleys (10 damage each) and a chest unibeam: 1 s visible chest charge, then a 1.5 s beam (48 m) that sweeps after the hero at 0.75 rad/s — slower than a swing, so it can be escaped. 9 damage per 0.4 s tick. A staggered or downed boss loses its beam.
- Hits use the existing hurt path (hp, hurt flash, toast, haptics, regen delay) and respect dodge i-frames. Web Shock pops incoming bolts within 6.5 m.
- Render: pooled, instanced additive fresnel glows (bolts, trails, palm and chest charge) + an instanced beam: 2 draw calls, no lights on any tier, tagged for the existing selective bloom.
- Sound: merged the cinematic sound pass (branch sound-pass, 4e33237) and wired the enemy-weapon hooks (repulsor charge/bolt/impact, unibeam charge/start/move/stop; the beam sound follows the nearest point of the sweep).
### Changed
- Sirens removed from the city ambience (Shifat: "No sirens please"): recipe, scheduler and demo usage deleted; hum, traffic and horns stay.
- Palm trunk top narrows to a pointed tip where the fronds attach (Shifat on palm_ba.jpg).
### Preserved
- Hero models, materials and the hero HD pass are untouched (locked). The arm raise is shown by the palm glow; the instanced robot rig itself is unchanged.
### Verification
- `npx tsc --noEmit`, `npm run build`, `test/sound.mjs` and `test/audio.mjs` pass. Headless frame strip at /home/user/tab/files/shadeverse/enemy_shots.jpg. Physical-device performance remains untested.

## [Released] - env-iter3: palm fronds, natural trunks, near-field sharpen, one-piece meadow outline, underwater bubble fix
### Changed
- Palm fronds: each frond is now one arched, drooping strip folded into a shallow inverted V along its rib, textured with a procedural pinnate leaflet alpha map (pale midrib + ~60 thin leaflet pairs) and alpha-tested (no blending). 18 living fronds in a golden-angle spiral, 4 browning hangers and 2 young spears, plus a slow per-frond bob on top of the shared tree wind. An alpha mip-boost keeps thin leaflets from dissolving at distance. ~860 tris per palm (was 720), 240 on the far LOD; same draw calls.
- Tree trunks (oak, pine/spruce, cherry, palm): seeded natural tubes instead of straight open cylinders — power-curve taper, gentle bend, root flare with buttress lobes, slight bark irregularity, darker root-end vertex colour and the bark texture reused as a bump map. Branch limbs taper, curve up into the canopy and have a collar at the trunk. Palm trunk is one smooth curved tube with a swollen foot and a leaf-scar ring texture. Canopies/foliage are byte-identical (separate RNG for trunk detail).
- Near-field sharpen: the world's final FXAA pass now applies a clamped, contrast-adaptive unsharp mask whose strength comes from depth (full within ~6 m, none beyond ~28 m, never on the sky, backed off on hard edges). Distant scenery and the locked hero HD pass are unchanged.
- Grass outline: blades no longer get ink outlines one by one (three's OPAQUE define had been overwriting the grass alpha mask back to 1.0). Grass/flowers (alpha class 0.25) and the park ground/trail (0.375) now form one class in the outline pass, so only the meadow's outer silhouette is inked.
- Underwater bubbles (ocean + lake): bubbles were glued to a box around the hero, rose to the flat sea level while the ocean swells about ±1.3 m (so in troughs they floated in the air), and wrapped with a hard pop. They are now world-anchored columns from the floor to just under the real wave surface, with fade in/out. The underwater look (fog/background) also follows the real swell height instead of the flat sea level.
### Locked
- Heroes (Shadow + Ghost, incl. heroHD) are locked in lock.md per Shifat (Oct 29). No hero file was touched.
### Verification
- `npx tsc --noEmit` and `npm run build` pass. Headless Chromium WebGL2/SwiftShader before/after captures at 915x412@1.75 and 1366x768: palm, trunks, grass outline, near sharpen, underwater. Physical-device performance remains untested (estimates in the iteration report).

## [Released] - Restored lake/city district and Shadow swim orientation
### Changed
- Restored the legacy procedural buildings as the central old city and placed Polyfork building families around it as the outer district; the shared city traversal/collision routes and rooftop boss arena remain intact. Removed above-ground subway building instances and placed four small entrances below soil level.
- Kept Polyfork tree and shrub silhouettes while restoring full layered legacy-style foliage across nine recognizable tree species and bushes: 266 trees, 54 bushes, nine species-specific leaf overlays, and 48 layered shrub cards. The old lake and bridge crossing remain the only restored legacy environment area.
- Rebuilt the lake as a 3.8 m basin under the existing bridge and ramps. Its broad calm wave displacement uses the same simulation clock and wave function as buoyancy; swimmers retain buoyancy, drag, shallow dive/floor limits, and waterline transitions. The mobile water shader uses Schlick Fresnel reflection, screen-space Snell-direction refraction with depth absorption, animated caustics, God rays, and shoreline/object-contact foam through throttled 256×128 scene captures.
- Fixed Shadow's swimming orientation by applying the swim lean to the rig wrapper after swim-clip sampling. The locked Shadow model, controls, HUD, ordinary melee, landscape-only mode, and Ghost swim implementation remain unchanged.
### Verification
- `npx tsc --noEmit`, `npm run build`, `PORT=4174 node test/environment.mjs`, `PORT=4174 node test/lake-swim-shadow.mjs`, and `PORT=4174 node test/water.mjs` pass. The phone-landscape WebGL2/ANGLE SwiftShader checks load 27/27 Polyfork GLBs, confirm 132 outer-district building placements, legacy center, four underground entrances, all 266 trees/54 bushes and detailed foliage overlays, lake reflection/refraction targets, and grounded bridge deck/ramps with zero browser errors; the existing ocean swim/exit regression still passes.
- The lake swim regression verifies entry, buoyancy (starting Y −6.0 to about −5.04), drag (horizontal speed 6 to about 2.90), a live Shadow swim clip, wrapper pitch 1.45 with neutral skinned-body pitch, unchanged Ghost source against starting commit `4696dca`, underwater tint, and an updating reflection target.
- Matched 844×390 landscape captures: `art/environment/shot-before-lake-city-water-mobile-landscape.png` and `art/environment/shot-after-lake-bridge-polyfork-mobile-landscape.png`; underwater effects capture: `art/environment/shot-after-lake-underwater-mobile-landscape.png`. Physical-device appearance/performance remains untested.
- Scoped to the private mirror's `main`; the original repository remains untouched. The push is intended to trigger the existing mirror Vercel deployment.
### References
- The user-provided lake/bridge visual targets, Polyfork asset/license notes, and water shader/physics references are recorded in `docs/REFERENCES.md`; no third-party shader code or game assets were copied.

## [Released] - Pedestrian hand cleanup
### Changed
- Added mirrored low-poly palms, four rounded finger forms, and attached thumbs to NPC pedestrian instances. A pedestrian-only gait mask keeps wrist/hand vertices on the arm swing instead of the leg swing; the new 424 triangles per robot are merged into the existing instanced mesh.
### Preserved
- `src/hero.json`, the locked player Shadow model, default enemy robot material, NPC placement/AI, player controls, and HUD are unchanged.
### Verification
- `npx tsc --noEmit`, `npm run build`, `git diff --check`, `node test/pedestrian-hands.mjs http://localhost:4174/ art/pedestrian-hands/shot-after-hands-mobile-landscape.png`, `PORT=4174 node test/environment.mjs`, and `PORT=4174 node test/ghost-animation-sync.mjs` pass. The enemy fight check completes without browser errors.
- Matched Chromium WebGL2/SwiftShader phone-landscape captures at 844×390: full view `art/pedestrian-hands/shot-before-hands-mobile-landscape.png` / `shot-after-hands-mobile-landscape.png`; close wrist view `shot-before-hands-detail-mobile-landscape.png` / `shot-after-hands-detail-mobile-landscape.png`. Physical-device appearance and target-GPU performance remain untested.
- Scoped to the private mirror's `main`; the original repository remains untouched.

## [Released] - Ordinary swing ring cleanup
### Changed
- Removed the ordinary-swing screen attach ring, swing-button ripple, and linked dashed halo. The existing button icon kick, flash, cyan linked highlight, controls, and HUD layout remain; the purple Shadow and hot-pink Ghost Shock Web rings still render only during their owners' separate special attacks.
### Verification
- `npx tsc --noEmit`, `npm run build`, `git diff --check`, `node test/ordinary-swing-rings.mjs http://localhost:4174/`, `PORT=4174 node test/ghost-animation-sync.mjs`, `PORT=4174 node test/snare.mjs`, and `PORT=4174 node test/ghost-snare.mjs` pass. The focused 844×390 test checks attach feedback, button ripple, linked outline, both heroes' ordinary-swing ring/pulse counts, and browser errors; the special tests still see the 80-segment Shock Web rings. Physical-device appearance remains untested.
- Scoped to the private mirror's `main`; the original repository remains untouched. The push is intended to trigger the mirror's existing Vercel deployment.

## [Released] - Procedural 3D enemy fire KO
### Added
- Added a renderer-only pooled world-space burst on the existing enemy-down transition: an emissive low-poly core and tapered fire tongues, a short expanding ground ring, and additive embers. Four fixed-capacity instanced batches support up to six overlapping KOs; the VFX is tagged for the existing selective-bloom layer.
### Preserved
- No simulation, damage, hit cadence, KO/score logic, player controls/position, HUD, or environment code changed. The effect reads the existing down state and expires after 1.05 seconds.
### Verification
- `npx tsc --noEmit`, `npm run build`, `git diff --check`, and `node test/death-vfx.mjs http://localhost:4174/ art/death-vfx/shot-after-fire-ko-mobile-landscape.png` pass. The focused browser test directly drives the existing down-state transition (it does not measure combat timing) and checks no pre-KO burst, one trigger, world-space anchoring, pooled instance capacities, unchanged score/KOs/player HP/position/attack input, expiry, and zero browser errors.
- Matched phone-landscape evidence at 844×390: `art/death-vfx/shot-before-fire-ko-mobile-landscape.png` (alive) and `art/death-vfx/shot-after-fire-ko-mobile-landscape.png` (KO with fire). Chromium WebGL2/SwiftShader only; physical-device appearance and target-GPU frame rate remain untested.
- Release scope is the private mirror's `main`; the original repository remains untouched. The production push is intended to trigger the mirror's existing Vercel deployment.
### References
- Real-time VFX and Three.js implementation references are recorded in `docs/REFERENCES.md`; no third-party code, models, or textures were copied.

## [Released] - Polyfork lake, bridge, city and park rebuild
### Changed
- Replaced the rendered procedural city blocks with instanced Polyfork models across 178 remaining building sites and 15 model families; retained the existing city footprints, collision records, original Polyfork six-home block, routes, and rooftop boss arena.
- Replaced all mounted legacy park and side-street trees with 266 Polyfork trees spanning nine species, including palm, pine, oak, birch, maple, cherry blossom, and cherry, plus 54 Polyfork bushes. Added a mixed grove around the lake and kept bridge/path clearances.
- Added the Polyfork water body and a six-module wooden footbridge with two walkable approach ramps, 14 animated shoreline/support foam patches, a cutout so the old trail does not show through the pond, and a subdivided water surface. Retuned ocean motion to broad, calm swells with restrained crest foam.
- Rebuilt each grass blade as an eight-segment curved mesh and set its render alpha below the screen-outline mask threshold; the terrain/field silhouette keeps its outline. Added quarter-resolution selective bloom for explicitly tagged lights only (boss eyes, rooftop beacon, arena marker, orbs, and fireflies), excluding grass, blossom petals, and the full scene.
- Shadow, Ghost, combat, HUD placement, boss flight/armor, and ordinary traversal remain intact; existing light meshes only gained bloom tagging, and bridge/ramp ground support was added to traversal.
### Verification
- `npx tsc --noEmit`, `npm run build`, and `git diff --check` pass. `PORT=4173 node test/environment.mjs` passes at phone-landscape 844×390: all 27/27 Polyfork GLBs load, 178 city placements and all required species are present, and the hero grounds on both bridge deck and ramp with no browser errors. `test/water.mjs`, `test/ground.mjs`, `test/boss-arena.mjs`, `test/boss-flight.mjs`, `test/ghost-animation-sync.mjs`, `test/snare.mjs`, and `test/ghost-snare.mjs` also pass.
- Landscape comparison: `art/environment/shot-before-lake-bridge-mobile-landscape.jpg` and `art/environment/shot-after-lake-bridge-polyfork-mobile-landscape.png`. Testing used Chromium WebGL2/SwiftShader; physical-device appearance and target-GPU frame rate remain untested.
- Changes are scoped to the private mirror's `main`; the push is intended to trigger its Vercel deployment. No original-repository changes are included. Sources and asset/license notes are in `docs/REFERENCES.md`.

## [Released] - Rooftop boss autonomous flight
### Changed
- The armored 3× Shadow-body boss now performs an arena-bounded flight cycle when engaged: controlled lift to 6.5 m, a steady hover, a propelled traverse within the roof bounds, and a controlled landing. The existing attack windup, strike range/damage/recovery, Snare targeting, armor, red eyes, rooftop beacon, and player systems are unchanged.
- Added a restrained paired cyan boot-exhaust cue and tucked airborne leg pose. The exhaust responds to takeoff/hover/propel/landing and shuts off when grounded, hit, or KO'd; the Shadow player, controls, HUD, ordinary melee, and landscape-only behavior are untouched.
### Verification
- `npx tsc --noEmit`, `npm run build`, `PORT=4187 node test/boss-flight.mjs` (all flight phases, roof bounds, thruster response, touchdown, and unchanged player input), `PORT=4187 node test/boss.mjs` (desktop and phone-landscape body/armor/eyes/melee exclusion/strike/Snare), `PORT=4187 node test/boss-arena.mjs` (roof and 84 m beacon), and `PORT=4173 node test/ghost-animation-sync.mjs` (25 shared-action cases) pass in Chromium WebGL2/SwiftShader.
- The legacy `test/combat.mjs` did not complete reliably in this SwiftShader environment: its wall-clock waits sampled before melee/landing events. A direct live trace registered the ordinary melee hit and lowered enemy health; no player combat or control code was changed. Physical devices and target-GPU frame rates remain untested.
- Phone-landscape flight evidence: `art/boss/shot-after-boss-flight-mobile-landscape.png` (844×390). Changes are scoped to the private mirror `main`; no original-repository changes were made.

## [Released] - Ghost swing parity and independent eye-colored Shock Web
### Changed
- Ghost now uses the same alternating one-hand web strand as Shadow during ordinary swings (odd swing: right; even swing: left); both hands remain reserved for the spring-launch pose. Neither hero emits pulse or ring geometry during an ordinary swing.
- Shadow and Ghost keep independent Shock Web instances, target lists, timing, and cooldowns. One hero's activation does not trigger or merge the other's attack. Shadow's special strands/pulse/rings are purple (`#a855f7`); Ghost's are hot pink (`#ff1a96`), matching their lenses. Each effect is visible only during its owner's special.
- Changed only the special button glyph to a lightning/shock symbol; its 48px box, position, label, styling, cooldown ring, and every other HUD element are unchanged. Shadow's model, controls, ordinary melee, spring-launch behavior, landscape-only gameplay, and the 3× red-armored rooftop boss and beacon are preserved.
### Verification
- `npx tsc --noEmit`, `npm run build`, `PORT=4187 node test/ghost-animation-sync.mjs` (25 shared-action cases, alternating one-hand swings, dual-hand spring, and no swing pulses/rings), `PORT=4187 node test/snare.mjs` (Shadow-only five-target attack and purple shock at desktop and phone-landscape), and `PORT=4187 node test/ghost-snare.mjs` (Ghost-only attack and hot-pink shock at phone-landscape), plus focused traversal and boss checks.
- Changes are scoped to private mirror `main`; the original-repository copy remains pinned at `9358d66` and is not included.

## [Released] - Ghost one-hand swing strand parity
### Changed
- Ghost now emits a single web strand from the same alternating hand as Shadow during ordinary swings (odd swing: right; even swing: left). Both strands remain reserved for the two-hand spring-launch pose.
- Shadow’s model, controls, animation/action source, spring launch, simulator, HUD, ordinary melee, landscape-only behavior, and the 3× red-armored rooftop boss remain unchanged.
### Verification
- `npx tsc --noEmit`, `npm run build`, and `PORT=4173 node test/ghost-animation-sync.mjs` cover 25 shared-action cases, including alternating one-hand web strands, no swing shock rings/pulses, and the existing two-hand spring-launch regression. Focused Ghost traversal and boss checks are recorded below after the release verification run.
- Changes are scoped to private mirror `main`; the original-repository copy remains pinned at `9358d66` and is not included.

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
- Ghost renders Shadow's shared live clip and procedural action poses for traversal, spring-shot, glide/flight, swimming/dive, dodge/roll/cartwheel, all seven melee moves, and plasma web; each hero's Shock Web special is evaluated from its own simulator, targets, and timing. The two-hand spring shot is driven by the real jump-from-web simulator transition and aims both hands at Shadow's anchor.
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
- The user-provided lake/bridge visual targets, Polyfork asset/license notes, and water shader/physics references are recorded in `docs/REFERENCES.md`; Polyfork models are used under its license, and no third-party water or shader code was copied.
