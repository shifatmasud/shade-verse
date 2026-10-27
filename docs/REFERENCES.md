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
