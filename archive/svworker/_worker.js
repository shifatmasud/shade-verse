
const KEY = 'fd53e271cf141f01c51026fd91567392';
const CT = {html:'text/html; charset=utf-8',js:'text/javascript',css:'text/css',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml',json:'application/json',glb:'model/gltf-binary',gltf:'model/gltf+json',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',m4a:'audio/mp4',txt:'text/plain; charset=utf-8',ico:'image/x-icon',wasm:'application/wasm',ktx2:'image/ktx2',bin:'application/octet-stream',hdr:'application/octet-stream',woff2:'font/woff2'};
export default {
  async fetch(req, env) {
    const u = new URL(req.url); let p = decodeURIComponent(u.pathname);
    if (p.startsWith('/__up/')) {
      if (req.headers.get('x-key') !== KEY) return new Response('no', {status: 403});
      const k = p.slice(6);
      if (req.method === 'PUT') { await env.FILES.put(k, req.body); return new Response('ok'); }
      if (req.method === 'DELETE') { await env.FILES.delete(k); return new Response('ok'); }
      return new Response('?', {status: 405});
    }
    if (p === '/__log' && req.method === 'POST') { const b = await req.text(); if (b.length < 200000) await env.FILES.put('__log/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), b); return new Response('ok'); }
    if (p === '/__logs') { if (u.searchParams.get('k') !== KEY) return new Response('no', {status: 403}); const l = await env.FILES.list({prefix: '__log/', cursor: u.searchParams.get('c') || undefined}); return Response.json({keys: l.objects.map(o => o.key), cursor: l.truncated ? l.cursor : null}); }
    if (p.endsWith('/')) p += 'index.html';
    let k = p.slice(1); if (k.startsWith('__log/') && u.searchParams.get('k') !== KEY) return new Response('no', {status: 403}); let o = await env.FILES.get(k);
    if (!o) { o = await env.FILES.get('index.html'); k = 'index.html'; if (!o) return new Response('not found', {status: 404}); }
    const ext = k.split('.').pop().toLowerCase();
    const h = new Headers({'content-type': CT[ext] || 'application/octet-stream', 'cache-control': k === 'index.html' ? 'no-cache' : (k.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600')});
    return new Response(o.body, {headers: h});
  }
};
