// Quality tiers (env-iter1 / HQ desktop pass). "auto" is the existing behaviour; "high" is the desktop high-quality mode.
// Pick: ?q=high | ?q=low | ?q=auto forces a tier. Otherwise touch devices and integrated/mobile GPUs stay on auto, and only a
// clearly strong desktop GPU (discrete NVIDIA / AMD Radeon, Apple M-series) auto-picks high. No UI.
export type QTier = 'low' | 'auto' | 'high';
export interface Quality { tier: QTier; gpu: string; forced: boolean; weakGpu: boolean; coarse: boolean }

function readGpu(): string {
    try {
        const c = document.createElement('canvas');
        const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
        if (!gl) return '';
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const s = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return s;
    } catch { return ''; }
}

function detect(): Quality {
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const gpu = typeof document !== 'undefined' ? readGpu() : '';
    const weakGpu = /intel|adreno|mali|powervr|swiftshader|llvmpipe|software|microsoft basic|videocore|apple gpu/i.test(gpu) || !gpu;
    const strong = /nvidia|geforce|quadro|rtx|gtx|radeon (rx|pro)|radeon\(tm\) rx|apple m\d/i.test(gpu);
    let param = '';
    try { param = (new URLSearchParams(location.search).get('q') || '').toLowerCase(); } catch { /* no location */ }
    if (param === 'high' || param === 'low' || param === 'auto') return { tier: param as QTier, gpu, forced: true, weakGpu, coarse };
    return { tier: !coarse && strong && !weakGpu ? 'high' : 'auto', gpu, forced: false, weakGpu, coarse };
}

export const QUALITY: Quality = detect();
export const HQ = QUALITY.tier === 'high';
export const LOWQ = QUALITY.tier === 'low';
// Per-tier knobs used across the scene.
export const QK = {
    dprCap: HQ ? 2 : QUALITY.coarse ? 1.5 : LOWQ ? 1 : 2,   /* touch: the world at 1.5 dpr, heroes stay native (HD pass) - Shifat 4:28 AM */
    maxScale: HQ ? 1.25 : 1.34,
    anisotropy: HQ ? 8 : 4,
    grass: HQ ? 9500 : LOWQ ? 3500 : 6500,
    grassRadius: HQ ? 72 : 57,
    leafLodDist: HQ ? 70 : 45,
    // Shifat Oct 29 "add more foliage on trees": leaf-card multiplier for the broadleaf/cherry/umbrella/poplar canopies (palms and conifers unchanged).
    foliage: HQ ? 1.9 : LOWQ ? 1.25 : (QUALITY.coarse || QUALITY.weakGpu) ? 1.45 : 1.65,
    lakeCopyScale: HQ ? 0.5 : 0.25,
    lakeSteps: HQ ? 16 : 7,
};
// Anti-aliasing: MSAA only where it is cheap (not touch, not integrated/mobile GPUs — Shifat's UHD 600 flags MSAA slow); FXAA elsewhere.
export const AA_MSAA = !QUALITY.coarse && !QUALITY.weakGpu && !LOWQ;
export const AA_FXAA = !AA_MSAA;
