import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412});
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('requestfailed',r=>errs.push('FAIL '+r.url()));
await p.goto(process.argv[2],{waitUntil:'load',timeout:90000}); await new Promise(r=>setTimeout(r,6000));
await p.evaluate(()=>window.__game&&window.__game.start()); await new Promise(r=>setTimeout(r,9000));
await p.screenshot({path:process.argv[3]}); console.log(JSON.stringify(errs.slice(0,8))); await b.close();