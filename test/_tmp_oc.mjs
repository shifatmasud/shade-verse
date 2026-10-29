
import puppeteer from 'puppeteer-core';
const [port, out] = [process.argv[2], process.argv[3]];
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: true, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await b.newPage(); await page.setViewport({ width: 640, height: 400 });
const errs=[]; page.on('pageerror', e=>errs.push(String(e))); page.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/?q=high`, { waitUntil: 'load' }); await new Promise(r=>setTimeout(r,1500));
await page.evaluate(() => { window.__game.start(); });
await new Promise(r=>setTimeout(r,2000));
const shots=[[[0,25,-760, 0,0,-200],[0,-1,-750],'far_north'],[[60,12,-500, 0,-2,-1000],[60,-1,-490],'far_south'],[[0,-14,-560, 0,-40,-700],[0,-20,-560],'under_slope'],[[30,6,-240, 0,-1,-420],[30,-1,-235],'shore']];
const info=[];
for (const [c,hp,n] of shots) {
  await page.evaluate((c,hp) => { const {sim}=window.__game; sim.enemies.forEach(e=>{e.down=1e4;e.x=1e4;}); sim.pos=[...hp]; sim.vel=[0,0,0]; window.__camOv=c; }, c, hp);
  await new Promise(r=>setTimeout(r,3500));
  info.push(await page.evaluate(()=>{const {sim}=window.__game; return sim.pos.map(x=>+x.toFixed(1));}));
  await page.screenshot({ path: `${out}_${n}.jpg`, type:'jpeg', quality: 85 });
}
console.log(JSON.stringify({info, errs: errs.slice(0,3)}));
await b.close();
