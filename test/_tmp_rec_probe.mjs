
import { launch } from './_tmp_rec_lib.mjs';
const { browser, page } = await launch(640, 360);
try {
  const res = await page.evaluate(() => {
    const B = window.__game.buildings; const P = [-8, -60]; const out = {};
    const inside = (x, z) => B.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
    for (let a = 0; a < 360; a += 30) { const r = a * Math.PI / 180; let d = 0; while (d < 300 && !inside(P[0] + Math.sin(r) * d, P[1] + Math.cos(r) * d)) d += 1; out[a] = d; }
    // building near +z
    const near = B.filter(b => Math.abs((b.x0 + b.x1) / 2 + 8) < 40 && Math.abs((b.z0 + b.z1) / 2 + 60) < 40).map(b => [b.x0, b.x1, b.z0, b.z1, b.h].map(v => Math.round(v)));
    return { out, near };
  });
  console.log(JSON.stringify(res));
} finally { await browser.close(); }
