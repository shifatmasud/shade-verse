// Real-device diagnostics for the tab.bot build (Shifat's phone/laptop): shader errors, GPU limits, fps and render size,
// sent to the site's own /__log so device-only bugs can be found without asking anyone to test. Only on *.sites.tab.bot.
import { QUALITY } from './quality';
const ON = typeof location !== 'undefined' && /\.sites\.tab\.bot$/.test(location.hostname);
const id = Math.random().toString(36).slice(2, 10), logs: string[] = [];
function send(kind: string, data: any) {
    try { const b = JSON.stringify({ id, kind, t: Math.round(performance.now()), ua: navigator.userAgent, data }); if (!navigator.sendBeacon('/__log', b)) fetch('/__log', { method: 'POST', body: b, keepalive: true }); } catch { /* ignore */ }
}
if (ON) {
    for (const k of ['error', 'warn'] as const) { const f = console[k].bind(console); console[k] = (...a: any[]) => { const s = a.map((x) => (x && x.stack) || String(x)).join(' '); if (logs.length < 40 && (k === 'error' || /shader|program|webgl|gl_|context/i.test(s))) logs.push(k + ': ' + s.slice(0, 6000)); f(...a); }; }
    // every program link on this device: failures with the driver's own log, and the sea program's active-uniform load (Adreno 506 has 256 fragment vec4)
    for (const P of [(window as any).WebGL2RenderingContext, (window as any).WebGLRenderingContext]) if (P) { const lp = P.prototype.linkProgram; P.prototype.linkProgram = function (this: WebGL2RenderingContext, prog: WebGLProgram) { lp.call(this, prog); try { if (!this.getProgramParameter(prog, this.LINK_STATUS)) logs.push('LINK FAIL: ' + (this.getProgramInfoLog(prog) || '').slice(0, 6000)); else { const n = this.getProgramParameter(prog, this.ACTIVE_UNIFORMS); let sea = false, slots = 0; for (let i = 0; i < n; i++) { const u = this.getActiveUniform(prog, i); if (!u) continue; if (u.name === 'uBench') sea = true; slots += u.size * (u.type === this.FLOAT_MAT4 ? 4 : u.type === this.FLOAT_MAT3 ? 3 : 1); } if (sea) logs.push('sea program linked: ' + n + ' uniforms, ~' + slots + ' vec4 slots'); } } catch { /* ignore */ } }; }
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
