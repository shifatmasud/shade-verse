import puppeteer from 'puppeteer-core';

const port = process.env.PORT || '4173';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
await new Promise((resolve) => setTimeout(resolve, 1100));
await page.evaluate(() => window.__game.start());
await new Promise((resolve) => setTimeout(resolve, 700));

const evidence = await page.evaluate(() => {
    const sim = window.__game.sim, boss = sim.enemies.find((enemy) => enemy.boss), marker = window.__bossArenaMarker;
    if (!boss || !marker) throw new Error('Boss or arena marker is missing');
    sim.enemies.forEach((enemy) => { if (!enemy.boss) enemy.down = 1000; });
    window.__camOv = [marker.position.x - 28, marker.position.y + 18, marker.position.z - 38, marker.position.x, marker.position.y + 7, marker.position.z];
    const beam = marker.children[0], ring = marker.children[2];
    return {
        boss: { x: boss.x, y: boss.y, z: boss.z, roof: boss.roof },
        marker: { x: marker.position.x, y: marker.position.y, z: marker.position.z, tagged: marker.userData.bossArena === true, children: marker.children.length },
        beam: { height: beam.geometry.parameters.height, color: beam.material.color.getHexString() },
        ring: { type: ring.geometry.type, color: ring.material.color.getHexString() },
        roofContainsBoss: !!boss.roof && boss.x > boss.roof.x0 + 1 && boss.x < boss.roof.x1 - 1 && boss.z > boss.roof.z0 + 1 && boss.z < boss.roof.z1 - 1,
        bossModel: window.__bossVisual?.bodyModel || null,
    };
});
await new Promise((resolve) => setTimeout(resolve, 800));
await page.screenshot({ path: 'art/boss/shot-after-boss-arena-mobile-landscape.png' });
const ok = evidence.marker.tagged && evidence.marker.children >= 4 && evidence.beam.height >= 80 && evidence.beam.color === 'ed001f' && evidence.ring.type === 'RingGeometry' && evidence.roofContainsBoss && errors.length === 0;
console.log(JSON.stringify({ ok, evidence, errors }));
console.log(ok ? 'BOSS ARENA PASS' : 'BOSS ARENA FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
