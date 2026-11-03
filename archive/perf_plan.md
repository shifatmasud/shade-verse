# Shade Verse perf plan (Shifat Nov 2 2:48 AM: long list, finish all, update every 5 min)
Rule: no perceived visual quality drop; A/B pinned perf (pq) + identical before/after shots; ship checklist each.
Status: [ ] todo  [x] shipped  [-] dropped (reason)
[x] 0 env DPR 0.8 (0691492)
[x] 0 lilies far cull (56261ab)
[x] 0 harbor roof props gate (3be5b05)
[-] 1 (checked 2:58: rain/mist/underwater/FX already hidden when inactive; only the small park lake draws from the ocean - negligible) hidden-when-idle check: rain/weather particles, mist planes, underwater (kelp/rays/snow/bubbles), death FX, lightning - must not draw when inactive
[-] 2 (no shadow maps in the game: soft baked/contact shade only) shadow map: is it on? size, update only when sun moves / static casters
[x] 3 (only 2 per-frame allocations existed; fixed; death-vfx harness times out on HEAD too - stale test) per-frame garbage: new Vector3/Color/arrays inside useFrame -> GC spikes (the phone stutters)
[-] 4 (measured: whole scene matrix update 0.06 ms/frame, 582 objects - nothing to gain) static meshes matrixAutoUpdate=false (CPU matrix work per frame)
[-] 5 (already precompiled at load + ShaderWarmup compiles hidden objects too) shader warm-up: ~270 programs compile lazily -> hitches when new areas appear; precompile at load (gl.compileAsync)
[x] 6 (frustum culling on static island/river/falls/bridge/harbor meshes; distance LOD skipped - visible skyline) island/ice/farm terrain + park ground: hide or low-LOD when far and fogged
[x] 7 (far LOD >140 m: island lilies 93k -> 57k tris) lily LOD: far patches as cheap pads (93k tris at the island)
[x] 8b waterline re-measure (8f2a3e8: 5d6eb69 has no measurable frame cost at surface/swim/deep/high cams; CPU line solve 0.41 -> 0.28 ms/frame, bit-identical over 300 poses; files/perf/waterline_opt.jpg)
[x] 8 (blur at 1/4 res + 1-tap add: phone harbor 348->320, island 381->364, ocean 336->315) bloom pass: skip when no glowing object on screen; cheaper re-render
[x] 9 (a95e46c: update code itself cheap 0.15-0.3 ms; real cost = unculled instanced crowd/drone/bot tris with animated + ink vertex shaders -> instances outside the view packed out of the draw; tris street 426k->364k (-14%), harbor 309k->250k (-19%, 5 fewer draws), island unchanged; shot files/perf/item9_crowd_cull.jpg) civilians/crowd/boats/gulls/fish: skip animation + matrix updates when off-screen or far
[x] 10 (0479017: grid already view-sliced/warped/train-skipped and fewer cells was rejected for snap shimmer; instead the sea vertex shader computed each wave train twice (whdV + wghj) -> merged whdgjV, same values, pixels unchanged; elevated sea cams ~360-420 -> ~230 ms indicative (box contended); files/perf/item10_sea_vertex.jpg) sea grid vertex count vs view (oceanGeo rings), far rings coarser
[-] 11 (upper bound: removing every non-sea transparent layer = 10-24%, spread over 24-43 small draws; mist already gated off at street/harbor; island lagoon/glow layers 3 draws, within noise; nothing removable without a visible change) transparent overdraw: mist/rain/halo layers fill cost on phone
[-] 12 (pass list on phone: world RT 0.8 dpr -> sea, outline, FXAA+sharpen, bloom 1-tap add, then the locked hero-HD native composite. Outline+FXAA can't merge with identical pixels (FXAA reads 9 outlined neighbours = outline kernel 9x); folding the bloom add into FXAA saves one 1-tap world-res pass (<1%) and rounds differently; native composite = hero-HD lock) FXAA + sharpen + outline passes: merge / fewer full-screen passes
[-] 13 (audit: 37 scene textures, ~52 MB incl. mips; largest 1024^2 = hero skins + boss body/emissive, rest <=512, all mipmapped; aniso 16 only on hero skins, 4x on 512 world maps - lowering blurs ground at grazing angles = visible; all preloaded + warmed on Play, no mid-game upload) textures: sizes, mipmaps, anisotropy on phone; upload stutter
[-] 14 (per-mesh in-view triangle audit: big off-view meshes are plain-shader static ones - seabed 17.6k (feeds sea refraction), island 31k, ice isle 26k, park ground 18k, bridge 10.8k (already culled as wholes); building batch already culled per building. Off-view tris cost a ~10-ALU vertex shader then clip; chunking adds 5-15 draws (~15 us CPU each on box, ~6x phone) = more than it saves. Item 9 paid because those were heavy animated shaders) big merged city meshes: chunk so frustum culling works
[-] 15 (in-page draw-path timing: 95-140 submissions/frame, 1.4-1.9 ms CPU/frame on box total; 77-118 distinct materials so nothing merges without atlasing (look change); only street-props share one material over 6 geometries. Skipping empty instanced meshes (37/140 at island) was exact but measured 0.05 ms/frame -> reverted) draw-call merge for small separate meshes (same material)
[x] 16 (final_regression.jpg + summary table below) final: full regression shots + perf summary report

## Size/streaming (Shifat 3:21 AM m:4cf9cc71 'reduce codebase storage size, KB, or better streaming') - measured: JS 3.4 MB raw / 1.17 MB gz, models 2.8 MB, audio 12 MB (mp3+ogg dupes), total dist 20 MB
[-] 17 (dropped 3:33: ~30-50 KB after gzip, no fps value - told Shifat) GLSL minify (strip comments/whitespace at build)
[x] 18 (lossless meshopt, 2.8 MB -> 0.82 MB; quantized version broke footbridge - not used) GLB meshopt compression (polyfork/*.glb)
[-] 19 (Android/Chrome loads only .ogg = 6.3 MB: VO 282 clips 5.3 MB mono vorbis ~80 kbps, music 0.5 MB at 47 kbps; no duplicates; no lossless masters, so re-encode is lossy-on-lossy: vorbis q0 = only -28% (~1.5 MB) and decoded waveform 9-18 dB SNR vs today = not 'same sound') audio re-encode smaller, same sound
[x] 20 (replaced: music lazy-load would break preload rule; instead VO decode-on-first-use + keep 24: ~93 MB -> ~5 MB decoded RAM) streaming: city-first load, music/far areas lazy
(do after #8; #16 final report moves last)

## Shifat 3:28 'don't follow blindly, suggest smart ideas' -> my order: 18 GLB meshopt, 20 music lazy-load after start, then NEW 21 30 fps cap w/ stable pacing (phone), 22 city mesh merge (draw calls); 19 audio re-encode low priority.

3:50: 21 30fps cap DROPPED (phone ~8 fps), 22 city merge DROPPED (79-83 calls). NEW 23: triangle diet - park-ground 41k flat lawn, unnamed ShaderMaterial 24k/17k, instanced '?' Lambert 13k-12k (identify), street-props 16k/9.7k basic. street total 466k tris.
[x] 23 park ground grid 144->96, 41k -> 18k tris, same look (41e6cf9)

## Final summary (item 16, Nov 2 21:5x) - every perf commit, measured gain
0   0691492  world at fixed 0.8 DPR, heroes native            biggest fill cut (phone)
0   56261ab  lilies past 420 m not drawn                       -145k tris everywhere
0   3be5b05  harbor rooftop props only near harbor             -30k tris away from harbor
3   7916d1c  no per-frame garbage (scratch vectors)            fewer GC stutters
6   df8a484  frustum culling on static island/harbor meshes    off-view terrain not drawn
7   788a997  lily far LOD >140 m                               island 93k -> 57k tris
8   508a7b1  bloom blur 1/4 res, 1-tap add                     phone harbor 348->320, island 381->364, ocean 336->315 ms (pq)
8b  8f2a3e8  waterline solve, bit-identical                    0.41 -> 0.28 ms/frame CPU
9   a95e46c  crowd/drone/bot instances culled to view          street -14% tris, harbor -19% tris, -5 draws
10  0479017  sea vertex: each wave train once                  elevated sea ~360-420 -> ~230 ms (indicative)
18  43df476  GLB meshopt, lossless                             2.8 MB -> 0.82 MB download
20  2734d9c  VO decoded on first use                           ~93 MB -> ~5 MB decoded RAM
23  41e6cf9  park ground grid 144->96                          41k -> 18k tris
Dropped with measurements: 1 2 4 5 11 12 13 14 15 17 19 21 22.
Regression sheet: files/perf/final_regression.jpg (before 0691492^ phone | HEAD phone | HEAD desktop; title/street/harbor/island/ocean/swim/under; 0 page/shader errors). Harbor row: the hero had dropped into the water by the 9 s mark in the HEAD run (real-clock settle), not a look change.
