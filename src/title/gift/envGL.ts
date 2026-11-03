/** Shade Verse title GIFT: the portfolio's budget-GPU test (gl/quality.ts LOW_END_GPU), in the lazy gift chunk only (it opens a
 *  throwaway WebGL context to read the renderer name, so it must not run on the title itself) */
let gpu = ''
try { const c = document.createElement('canvas').getContext('webgl'); const d = c?.getExtension('WEBGL_debug_renderer_info'); gpu = d ? String(c!.getParameter(d.UNMASKED_RENDERER_WEBGL)) : ''; (c?.getExtension('WEBGL_lose_context'))?.loseContext() } catch { /* none */ }
export const LOW_END_GPU = /Adreno \(TM\) (3\d\d|4\d\d|50\d)\b|Mali-(4\d\d|T[678]\d\d|G31|G51|G52)|PowerVR Rogue GE/i.test(gpu) || /[?&]lowend\b/.test(location.search)

