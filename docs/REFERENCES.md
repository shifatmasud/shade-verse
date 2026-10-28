# Component references (inspected sources, informs only, nothing copied)

| Component | Source inspected | What it informed |
|---|---|---|
| Water | https://shaderbattle.com/guides/how-to-make-an-ocean-shader (fetched 06:08) | Sum-of-sines height field with several travelling waves, Fresnel sky/water mix (Schlick), sun glitter highlight, crest foam, distance haze. Implemented as an original cheap shader (4 waves, no raymarch) for weak GPUs. |
| Water (split view) | Own design: project the waterline ahead of the camera, tint only below it | Half-submerged camera while swimming at the surface. |
| Character animation | Mixamo clips (Adobe, free with Adobe ID; Adobe Mixamo FAQ https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Idle, Jump, Climbing Up Wall, Punching, Swimming, retargeted offline by bone direction to the original 17-bone rig. FBX are not shipped or redistributed. |
| Wall crawl | Spiderbench (view only, https://github.com/xikhar/spiderbench) | Idea of surface attach plus wall camera only. No code or assets used. |
| Character anatomy | Own SDF generator (tools/genhero.mjs) | Original masked humanoid. Spider-Man is inspiration only. |
| Video ref (youtu.be/pyKONWsQ1ek) | NOT viewed (tools could not read it) | Nothing. |

## Art direction benchmark (private research, frames NOT stored in repo)
- Marvel's Spider-Man 2 (Insomniac) gameplay, public YouTube video uPANIcGM--Y (PS5 4K swinging/combat), viewed as 5 browser screenshots on 06:41. Informs: sky with volumetric clouds and haze, varied skyline heights and spires, trees/park, water reflections, wide third-person swing camera, minimal UI. Inspiration only; no assets, code or design copied.

## SM2 benchmark provenance (private, benchmark only, no assets copied)
- https://www.youtube.com/watch?v=uPANIcGM--Y : sequential frames at t=38.5, 39.0, 39.5, 40.0, 40.5 s (swing); stills at t=60 (park), 120 (fight), 180 (street), 240 (water), 300 (wall), 360 s (walk). Frames kept outside the repo.

## Hero model v2 (Gemini 4 Argon)
- tools/genhero_g4a.mjs was written by Gemini 4 Argon (Gemini web, user's Pro account, no per-use charge seen) from a brief for an original masked hero with our 17-bone skeleton. It writes src/hero.json (17k verts). Previous hero kept as tools/genhero.mjs.

## Combat choreography benchmark (private research, frames NOT stored in repo)
- YouTube D9xHicWET3I at t=14.2s to 15.7s: Spider-Man 2 martial arts combat choreography, gap-closing strike lunges, 3-hit combo cadence, and hit-stop impact frame weighting. Inspiration only; no code or assets copied.

## Greenery and Tree Visual Reference (for world redesign phase)
- https://x.com/keydol123/status/2115168883040817610 : Color and tree references for greenery palette and vegetation when world upgrade / full environment redesign starts via Polyfork. Inspiration and palette reference only; scene not copied wholesale.

## Shadow Snare upgrade reference pass (2026-10-28)

Visual research was completed before changing gameplay code. The reference footage is inspiration only; no game assets or code were copied.

- Web Blossom special-attack footage: https://makeagif.com/gif/spider-man-ps4-e3-2018-special-attack-EaNJa6 (source video: https://youtu.be/X3ricWI0KHE). Captured/reviewed sequential moments in the GIF: Spider-Man airborne above a group with both arms extended and the WEB BLOSSOM HUD label; bright orange impact-like effects around a target below; then a crouched recovery with several enemies down and lingering effects. A distinct web-spread pattern was not visible in the retained captures, so this source informs launch-to-recovery cadence only.
- Web Bomb visual: https://makeagif.com/gif/spidermans-web-bomb-gameplay-of-marvels-spider-man-on-ps4-kG9YKW (direct GIF: https://i.makeagif.com/media/12-18-2023/kG9YKW.gif). The inspected still showed a bright white burst with web-like spray around nearby enemies. The source is a user-hosted, watermarked GIF; use it only as a visual reference, not as a redistributed asset. Sequential web-spread frames were unavailable.
- 540 hook-kick motion: https://commons.wikimedia.org/wiki/File:Taekwondo_540_Hook.gif. The Wikimedia page identifies a 64-frame, 3.2-second 540 hook-kick GIF and CC0 1.0 license. Captured/reviewed key poses in order: low load; torso pivot and arm counterbalance; airborne chamber; high extended hook; landing; upright recovery. Use the movement order to time the finisher, not as a model or exact choreography.

Implementation direction from the inspected references: widen the Snare's multi-target web gather, hold the grouped enemies briefly, then use a committed spinning kick with a larger impact response. Keep melee choreography and hero/UI design unchanged.

## Ghost companion first-scene follow (reference-only; no assets or code copied)
- White-suit visual palette: [Black Widow | MCU White Suit Skin Showcase](https://www.youtube.com/watch?v=5uhx7_oSV-o), observed at 00:20–00:24 as a frame sequence. Used only as a high-level contrast check (light suit against dark flexible joints and a streamlined athletic outline); Ghost's masked head, cyan accents, panel layout, proportions, and geometry are original. No logos, weapon, hair, costume details, or assets were reused.
- Companion follow motion: [How To Make A Friendly AI Companion Follow The Player](https://www.youtube.com/watch?v=0Xbq5BrvmgQ), observed at 06:44–06:48 frame by frame. The sequence shows a run with stable spacing, a catch-up transition, then a walk-to-idle stop. Used to guide a smoothed following target and locomotion blend; the implementation is original and does not use the video's code or assets.
- The chapter-level overview at 00:56 and sprint section at 06:44 are from an Unreal Engine editor demonstration. The sequence is a motion/spacing reference only, not a final-game art benchmark.

## Shadow-bodied giant boss revision (2026-10-29)

- Visual reference: [Michelangelo's David — right view 2, Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Michelangelo%27s_David_-_right_view_2.jpg). The photographed white Carrara-marble sculpture (1501–1504) was used only as a real-world check for broad, athletic male proportions and a light finish. The boss reuses the project's own Shadow mesh; no reference image or external model is shipped. The Commons page lists CC BY-SA 4.0 and a separate Italian cultural-heritage reuse notice; this reference image is not incorporated into the game.
- Motion reference: [The Biomechanical Characteristics of the Strongman Yoke Walk, Frontiers](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2021.670297/full). In 19 strongman athletes, the study reports relatively short strides and longer stance time during loaded walking; the existing boss keeps a restrained cadence rather than simply moving Shadow's gait at full speed. This human study is contextual evidence, not a direct model of a fictional giant.
- Animation principle: [5 Rules For Animating Colossi, GameAnim](https://www.gameanim.com/2021/09/30/5-rules-for-animating-colossi/). Its summary of Masanobu Tanaka's talk informed smooth movement starts and restrained heavy-limb overlap. No reference artwork, animation, or code was copied.
