// Hero trim colour (Shifat, Nov 2 3:49 PM: "We can redesign our gold pipings to ghost & shadows colors like the illustration").
// Both heroes share one baked costume texture whose piping, chest emblem and belt buckle are painted gold. On load the texture is
// repainted on a canvas: every gold pixel takes the hero's own colour (Shadow purple, Ghost hot pink, the same values sim fxCol uses),
// keeping the texture's own shading so the weave, creases and highlights stay. Same texture size, same material, no extra draw or pass.
import * as THREE from 'three';

export const SHADOW_TRIM = 0xa855f7;
export const GHOST_TRIM = 0xff1a96;

/** Soft 0..1 weight of how "gold" a texel is (warm hue, some saturation). The hard test is the one Ghost's repaint already used. */
export function goldWeight(r: number, g: number, b: number) {
    if (!(r > g * 1.10 && g > b * 1.06 && r > 55)) return 0;
    const sat = (r - b) / Math.max(r, 1), v = Math.max(r, g, b) / 255;
    // saturated AND bright enough: the piping/emblem/buckle, not the dull brown leather and shadowed weave beside it
    return Math.min(1, Math.max(0, (sat - 0.15) / 0.15)) * Math.min(1, Math.max(0, (v - 0.24) / 0.12));
}

/** Repaints gold texels in place to `hex`, shade-preserving. Returns nothing; call on ImageData.data. */
export function paintTrim(data: Uint8ClampedArray, i: number, hex: number) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const w = goldWeight(r, g, b); if (w <= 0) return false;
    const v = Math.max(r, g, b) / 255;                 // gold's own value carries the shading
    const shade = Math.min(1.08, 0.5 + 0.9 * v);       // lift a little so the line reads at night, never past the hero colour
    const tr = ((hex >> 16) & 255) * shade, tg = ((hex >> 8) & 255) * shade, tb = (hex & 255) * shade;
    data[i] = r + (tr - r) * w; data[i + 1] = g + (tg - g) * w; data[i + 2] = b + (tb - b) * w;
    return true;
}

/** Loads the costume texture and repaints its gold trim to `hex` (map + emissiveMap of `mat`). */
export function trimTexture(url: string, hex: number, mat: () => THREE.MeshLambertMaterial) {
    const tex = new THREE.TextureLoader().load(url, (source) => {
        const image = source.image as HTMLImageElement;
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(image, 0, 0);
        const px = ctx.getImageData(0, 0, canvas.width, canvas.height), d = px.data;
        for (let i = 0; i < d.length; i += 4) paintTrim(d, i, hex);
        ctx.putImageData(px, 0, 0);
        const painted = new THREE.CanvasTexture(canvas);
        painted.flipY = false; painted.colorSpace = THREE.SRGBColorSpace; painted.anisotropy = 16;
        const m = mat(); m.map = painted; m.emissiveMap = painted; m.needsUpdate = true;
        source.dispose();
    });
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
    return tex;
}
