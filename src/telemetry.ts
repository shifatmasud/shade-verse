// Real-device diagnostics for the tab.bot build (Shifat's phone/laptop): shader errors, GPU limits, fps and render size,
// sent to the site's own /__log so device-only bugs can be found without asking anyone to test. Only on *.sites.tab.bot.
import { QUALITY } from './quality';
import { addEffect, addAfterEffect } from '@react-three/fiber';
const ON = typeof location !== 'undefined' && (/\.sites\.tab\.bot$/.test(location.hostname) || /[?&]tel\b/.test(location.search));
const id = Math.random().toString(36).slice(2, 10), logs: string[] = [];
function send(kind: string, data: any) {
    try { const b = JSON.stringify({ id, kind, t: Math.round(performance.now()), ua: navigator.userAgent, data }); if (!navigator.sendBeacon('/__log', b)) fetch('/__log', { method: 'POST', body: b, keepalive: true }); } catch { /* ignore */ }
}
if (ON) {
    for (const k of ['error', 'warn'] as const) { const f = console[k].bind(console); console[k] = (...a: any[]) => { const s = a.map((x) => (x && x.stack) || String(x)).join(' '); if (logs.length < 40 && (k === 'error' || /shader|program|webgl|gl_|context/i.test(s))) logs.push(k + ': ' + s.slice(0, 6000)); f(...a); }; }
    // every program link on this device: failures with the driver's own log, and the sea program's active-uniform load (Adreno 506 has 256 fragment vec4)
    for (const P of [(window as any).WebGL2RenderingContext, (window as any).WebGLRenderingContext]) if (P) { const lp = P.prototype.linkProgram; P.prototype.linkProgram = function (this: WebGL2RenderingContext, prog: WebGLProgram) { lp.call(this, prog); try { if (!this.getProgramParameter(prog, this.LINK_STATUS)) logs.push('LINK FAIL: ' + (this.getProgramInfoLog(prog) || '').slice(0, 6000)); else { const n = this.getProgramParameter(prog, this.ACTIVE_UNIFORMS); let sea = false, slots = 0; for (let i = 0; i < n; i++) { const u = this.getActiveUniform(prog, i); if (!u) continue; if (u.name === 'uBench') sea = true; slots += u.size * (u.type === this.FLOAT_MAT4 ? 4 : u.type === this.FLOAT_MAT3 ? 3 : 1); } if (sea) logs.push('sea program linked: ' + n + ' uniforms, ~' + slots + ' vec4 slots'); } } catch { /* ignore */ } }; }

    // render-target health on this device: an incomplete framebuffer (e.g. a depth texture format the GPU refuses) silently renders nothing
    for (const P of [(window as any).WebGL2RenderingContext]) if (P) {
        const fbt = P.prototype.framebufferTexture2D, fbr = P.prototype.framebufferRenderbuffer, ts = P.prototype.texStorage2D, ti = P.prototype.texImage2D; let nFb = 0;
        const chk = function (this: WebGL2RenderingContext, what: string) { try { const s = this.checkFramebufferStatus(this.FRAMEBUFFER); if (s !== this.FRAMEBUFFER_COMPLETE && logs.length < 40) logs.push('FB INCOMPLETE 0x' + s.toString(16) + ' after ' + what); } catch { /* ignore */ } };
        P.prototype.framebufferTexture2D = function (this: WebGL2RenderingContext, t: number, att: number, tt: number, tex: WebGLTexture, l: number) { fbt.call(this, t, att, tt, tex, l); if (nFb++ < 400) chk.call(this, 'tex att 0x' + att.toString(16)); };
        P.prototype.framebufferRenderbuffer = function (this: WebGL2RenderingContext, t: number, att: number, rt: number, rb: WebGLRenderbuffer) { fbr.call(this, t, att, rt, rb); if (nFb++ < 400) chk.call(this, 'rb att 0x' + att.toString(16)); };
        P.prototype.texStorage2D = function (this: WebGL2RenderingContext, t: number, lv: number, f: number, w: number, h: number) { ts.call(this, t, lv, f, w, h); const e = this.getError(); if (e && logs.length < 40) logs.push('texStorage2D err 0x' + e.toString(16) + ' fmt 0x' + f.toString(16) + ' ' + w + 'x' + h); };
        P.prototype.texImage2D = function (this: WebGL2RenderingContext, ...a: any[]) { (ti as any).apply(this, a); if (a.length >= 9 && a[8] == null) { const e = this.getError(); if (e && logs.length < 40) logs.push('texImage2D err 0x' + e.toString(16) + ' ifmt 0x' + (+a[2]).toString(16) + ' type 0x' + (+a[7]).toString(16) + ' ' + a[3] + 'x' + a[4]); } };
    }

    // one-off device check: does this GPU report gl_FrontFacing correctly? (the sea used it to tell above from below water)
    setTimeout(() => { try {
        const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('webgl2'); if (!g) return;
        const sh = (t: number, s: string) => { const o = g.createShader(t)!; g.shaderSource(o, s); g.compileShader(o); return o; };
        const p = g.createProgram()!; g.attachShader(p, sh(g.VERTEX_SHADER, '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}')); g.attachShader(p, sh(g.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;out vec4 o;void main(){o=gl_FrontFacing?vec4(1,0,0,1):vec4(0,0,1,1);}')); g.linkProgram(p); g.useProgram(p);
        const b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b); const res: string[] = [];
        for (const [name, v] of [['ccw', [-1, -1, 3, -1, -1, 3]], ['cw', [-1, -1, -1, 3, 3, -1]]] as [string, number[]][]) {
            g.bufferData(g.ARRAY_BUFFER, new Float32Array(v), g.STATIC_DRAW); g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
            g.clearColor(0, 0, 0, 1); g.clear(g.COLOR_BUFFER_BIT); g.drawArrays(g.TRIANGLES, 0, 3); const px = new Uint8Array(4); g.readPixels(1, 1, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); res.push(name + '=' + (px[0] > 128 ? 'front' : px[2] > 128 ? 'back' : 'none'));
        }
        send('frontfacing', { res: res.join(' '), expect: 'ccw=front cw=back', timer: !!g.getExtension('EXT_disjoint_timer_query_webgl2'), exts: (g.getSupportedExtensions() || []).join(',') });
    } catch (e) { send('frontfacing', { err: String(e) }); } }, 4000);
    addEventListener('error', (e) => { if (logs.length < 40) logs.push('onerror: ' + e.message + ' ' + (e.filename || '') + ':' + (e.lineno || '')); });
    // where the frame time goes on the real device: CPU time inside renderer.render (scene walk + GL submit, incl. driver), main-thread long tasks
    let rMs = 0, rN = 0; const wrapGl = () => { const gl: any = (window as any).__gl; if (!gl || gl.__telWrapped) return; const rr = gl.render.bind(gl); gl.render = (...a: any[]) => { (window as any).__telMark(); const P = gpuP; const cx = P ? gl.getContext() : null; if (cx) gsync(cx); const t0 = performance.now(); try { return rr(...a); } finally { if (cx) { gsync(cx); const rt = gl.getRenderTarget(); const c = a[1]; if (c && !c.isOrthographicCamera && (c.layers.mask & 512) && rt) seaB = { s: a[0], c, w: rt.width, h: rt.height }; P!.push([(c && c.isOrthographicCamera ? 'q' : 'L' + (c ? c.layers.mask : 0)) + '@' + (rt ? rt.width + 'x' + rt.height : 'cv'), Math.round((performance.now() - t0) * 10) / 10]); } rMs += performance.now() - t0; rN++; (window as any).__telMarkEnd(); } }; gl.__telWrapped = true; }; setInterval(wrapGl, 1000);
    /* on-device GPU cost per render call (Shifat's phone has no timer queries): one frame every 20 s, gl.finish() around each call. No visual change; one slower frame. */

    /* offscreen sea bench on the probe frame (nothing on screen changes): the sea alone into a scratch target, full shading vs plain colour vs no wave math -> what the sea shader really costs this GPU */
    let seaB: { s: any; c: any; w: number; h: number } | null = null, seaRT: any = null;
    const seaBench = () => { const gl: any = (window as any).__gl, B = seaB; seaB = null; if (!gl || !B) return; const cx = gl.getContext(); let wm: any = null; B.s.traverse((o: any) => { if (!wm && o.material && o.material.uniforms && o.material.uniforms.uBench) wm = o.material; }); if (!wm) return;
        const T = gl.getRenderTarget(); if (!seaRT || seaRT.width !== B.w || seaRT.height !== B.h) { seaRT?.dispose(); seaRT = new (T ? T.constructor : Object)(B.w, B.h); }
        const mask = B.c.layers.mask, ub = wm.uniforms.uBench.value, ox = ub.x, oy = ub.y, out: number[] = [];
        try { B.c.layers.mask = 512; for (const [x, y] of [[0, 0], [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 0]]) { ub.set(x, y); gl.setRenderTarget(seaRT); gl.clear(); gsync(cx); const t0 = performance.now(); gl.render(B.s, B.c); gsync(cx); out.push(Math.round((performance.now() - t0) * 10) / 10); } }
        finally { B.c.layers.mask = mask; ub.set(ox, oy); gl.setRenderTarget(T); }
        (((window as any).__tel ||= {}) as any).sea = out.slice(1); };
    let gpuP: any[] | null = null; setInterval(() => { if (!(window as any).__gl || document.hidden) return; gpuP = []; requestAnimationFrame(() => requestAnimationFrame(() => { const r = gpuP; gpuP = null; if (r && r.length) { const tl: any = ((window as any).__tel ||= {}); tl.gpu = r; } seaBench(); })); }, 20000);
    /* where a frame's wall time goes (10 frames every 20 s, no gl.finish): gap = start-to-start, js = frame start -> first render, rend = first -> last render end, tail = after the renders, out = time outside the frame (browser/GPU/idle) */
    let fN = -1, fS = 0, fPrev = 0, fFirst = 0, fLast = 0; const fAcc = [0, 0, 0, 0, 0];
    addEffect((t) => { const n = performance.now(); if (fN >= 0) { if (fPrev) fAcc[0] += n - fPrev; fPrev = n; } fS = n; fFirst = 0; fLast = 0; });
    addAfterEffect(() => { if (fN < 0) return; const n = performance.now(); if (fFirst) { fAcc[1] += fFirst - fS; fAcc[2] += fLast - fFirst; fAcc[3] += n - fLast; } fAcc[4] += n - fS;
        if (++fN >= 11) { const k = 10, tl: any = ((window as any).__tel ||= {}); const g = fAcc[0] / k; tl.frame = { gap: Math.round(g), js: Math.round(fAcc[1] / 11), rend: Math.round(fAcc[2] / 11), tail: Math.round(fAcc[3] / 11), out: Math.round(g - fAcc[4] / 11) }; fN = -1; wN = 3; wF = []; } });
    /* whole-frame GPU: right after a timing window, 3 frames end with ONE gl.finish -> fin = GPU work still queued after the frame's last call, whole = frame start -> GPU idle */
    let wN = 0, wF: number[][] = []; const wGl = () => (document.querySelector('canvas') as HTMLCanvasElement | null)?.getContext('webgl2') as WebGL2RenderingContext | null;
    addAfterEffect(() => { if (wN <= 0 || fN >= 0) return; const gl = wGl(); if (!gl) { wN = 0; return; } const a = performance.now(); gsync(gl); const b = performance.now(); wF.push([Math.round(b - a), Math.round(b - fS)]); if (--wN === 0) (((window as any).__tel ||= {}) as any).whole = wF; });
    setInterval(() => { if (document.hidden || fN >= 0) return; fN = 0; fAcc.fill(0); fPrev = 0; }, 20000);
    (window as any).__telMark = () => { if (fN >= 0 && !fFirst) fFirst = performance.now(); };
    (window as any).__telMarkEnd = () => { if (fN >= 0) fLast = performance.now(); };   /* the renderer's render is an instance method (three r187) */
    /* Long Animation Frames (Chrome): which scripts / style / layout fill a slow frame, outside the 3D renderer too */
    const loaf = { n: 0, dur: 0, block: 0, style: 0, scripts: {} as Record<string, number> };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) { loaf.n++; loaf.dur += e.duration; loaf.block += e.blockingDuration || 0; if (e.styleAndLayoutStart) loaf.style += e.startTime + e.duration - e.styleAndLayoutStart;
        for (const s of e.scripts || []) { const k = (s.invokerType || '') + ':' + (s.invoker || '').slice(0, 40) + '@' + ((s.sourceURL || '').split('/').pop() || '').slice(0, 30) + ':' + (s.sourceFunctionName || '').slice(0, 30); loaf.scripts[k] = (loaf.scripts[k] || 0) + s.duration; } } }).observe({ type: 'long-animation-frame', buffered: false } as any); } catch { /* ignore */ }
    (window as any).__loaf = loaf;
    let busy = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) busy += e.duration; }).observe({ type: 'longtask', buffered: false } as any); } catch { /* ignore */ }
    let frames = 0; const tick = () => { frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    let n = 0, last = performance.now(), sentGpu = false;
    setInterval(() => {
        const now = performance.now(), span = now - last, fps = Math.round(frames * 1000 / span * 10) / 10; const perF = Math.max(1, frames); const cpu = { renderMsPerFrame: Math.round(rMs / perF * 10) / 10, rendersPerFrame: Math.round(rN / perF * 10) / 10, longTaskPct: Math.round(busy / span * 100) }; rMs = 0; rN = 0; busy = 0; frames = 0; last = now;
        const c = document.querySelector('canvas') as HTMLCanvasElement | null; const d: any = { build: ((document.querySelector('script[src*="index-"]') as HTMLScriptElement | null)?.src || '').split('/').pop(), fps, cpu, dpr: devicePixelRatio, css: c ? [c.clientWidth, c.clientHeight] : null, buf: c ? [c.width, c.height] : null, hud: (document.querySelector('[data-perf]') as any)?.textContent || null };
        const tl: any = (window as any).__tel; if (tl) d.tel = tl; const g: any = (window as any).__game; if (g && g.sim) d.pos = g.sim.pos.map((v: number) => Math.round(v)), d.swim = !!g.sim.swim;
        if (!sentGpu && c) { const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGL2RenderingContext | null; if (gl) { const di = gl.getExtension('WEBGL_debug_renderer_info'); d.gpu = { renderer: di ? gl.getParameter(di.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxTex: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS), maxVary: gl.getParameter(gl.MAX_VARYING_VECTORS), maxFragU: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS), maxVertU: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS), prec: (() => { const p = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT); return p ? p.precision : null; })(), exts: gl.getSupportedExtensions() }; d.quality = QUALITY; sentGpu = true; } }
        { const top = Object.entries(loaf.scripts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, Math.round(v)]); d.loaf = { n: loaf.n, dur: Math.round(loaf.dur), block: Math.round(loaf.block), style: Math.round(loaf.style), top }; loaf.n = 0; loaf.dur = 0; loaf.block = 0; loaf.style = 0; loaf.scripts = {}; }
        d.logs = logs.splice(0); send('sample', d);
        if (++n > 40) n = 40;   // keeps going, 1 per 15 s
    }, 15000);
}
/* true GPU completion: Chrome's gl.finish() only waits for the commands to reach the driver, a 1-pixel readPixels waits for the pixels themselves */
const _rb: Record<number, ArrayBufferView> = {};
function gsync(cx: WebGL2RenderingContext) { try { const f = cx.getParameter(cx.IMPLEMENTATION_COLOR_READ_FORMAT), ty = cx.getParameter(cx.IMPLEMENTATION_COLOR_READ_TYPE);
    const b = _rb[ty] ||= (ty === cx.FLOAT ? new Float32Array(4) : ty === cx.HALF_FLOAT || ty === cx.UNSIGNED_SHORT ? new Uint16Array(4) : ty === cx.UNSIGNED_INT || ty === cx.INT ? new Uint32Array(4) : new Uint8Array(16)); cx.readPixels(0, 0, 1, 1, f, ty, b); } catch { cx.finish(); } }
export {};
