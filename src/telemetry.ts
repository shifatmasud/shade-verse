// Real-device diagnostics for the tab.bot build (Shifat's phone/laptop): shader errors, GPU limits, fps and render size,
// sent to the site's own /__log so device-only bugs can be found without asking anyone to test. Only on *.sites.tab.bot.
import { QUALITY } from './quality';
const ON = typeof location !== 'undefined' && /\.sites\.tab\.bot$/.test(location.hostname);
const id = Math.random().toString(36).slice(2, 10), logs: string[] = [];
function send(kind: string, data: any) {
    try { const b = JSON.stringify({ id, kind, t: Math.round(performance.now()), ua: navigator.userAgent, data }); if (!navigator.sendBeacon('/__log', b)) fetch('/__log', { method: 'POST', body: b, keepalive: true }); } catch { /* ignore */ }
}
if (ON) {
    for (const k of ['error', 'warn'] as const) { const f = console[k].bind(console); console[k] = (...a: any[]) => { if (logs.length < 40) logs.push(k + ': ' + a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 4000)); f(...a); }; }
    addEventListener('error', (e) => { if (logs.length < 40) logs.push('onerror: ' + e.message + ' ' + (e.filename || '') + ':' + (e.lineno || '')); });
    let frames = 0; const tick = () => { frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    let n = 0, last = performance.now(), sentGpu = false;
    setInterval(() => {
        const now = performance.now(), fps = Math.round(frames * 1000 / (now - last) * 10) / 10; frames = 0; last = now;
        const c = document.querySelector('canvas') as HTMLCanvasElement | null; const d: any = { fps, dpr: devicePixelRatio, css: c ? [c.clientWidth, c.clientHeight] : null, buf: c ? [c.width, c.height] : null, hud: (document.querySelector('[data-perf]') as any)?.textContent || null };
        const g: any = (window as any).__game; if (g && g.sim) d.pos = g.sim.pos.map((v: number) => Math.round(v)), d.swim = !!g.sim.swim;
        if (!sentGpu && c) { const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGL2RenderingContext | null; if (gl) { const di = gl.getExtension('WEBGL_debug_renderer_info'); d.gpu = { renderer: di ? gl.getParameter(di.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxTex: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS), maxVary: gl.getParameter(gl.MAX_VARYING_VECTORS), maxFragU: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS), maxVertU: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS), prec: (() => { const p = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT); return p ? p.precision : null; })(), exts: gl.getSupportedExtensions() }; d.quality = QUALITY; sentGpu = true; } }
        d.logs = logs.splice(0); send('sample', d);
        if (++n > 40) n = 40;   // keeps going, 1 per 15 s
    }, 15000);
}
export {};
