import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const port = process.env.PORT || '4173';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
const assetResponses = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('response', (response) => {
    if (response.url().includes('/polyfork/') && response.url().endsWith('.glb')) {
        assetResponses.push({ url: response.url(), status: response.status() });
    }
});

try {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
    await new Promise((resolve) => setTimeout(resolve, 900));
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__polyforkBuildings && window.__polyforkVegetation && window.__polyforkDetailedFoliage && window.__polyforkLake && window.__polyforkLakeTargets && window.__bridgeSurfaceAt, { timeout: 30000 });

    const placementEvidence = await page.evaluate(() => {
        const lake = window.__polyforkLake;
        const vegetation = window.__polyforkVegetation;
        const buildings = window.__polyforkBuildings;
        const grass = window.__polyforkGrass;
        const foliage = window.__polyforkDetailedFoliage;
        const targets = window.__polyforkLakeTargets;
        const bridgeSurfaceAt = window.__bridgeSurfaceAt;
        const [cx, cz] = lake.bridgeCenter;
        const [ax, az] = lake.bridgeAxis;
        const rampX = cx + ax * (lake.bridgeHalfLength + lake.bridgeRampLength * 0.5);
        const rampZ = cz + az * (lake.bridgeHalfLength + lake.bridgeRampLength * 0.5);
        const rampEndX = cx + ax * (lake.bridgeHalfLength + lake.bridgeRampLength);
        const rampEndZ = cz + az * (lake.bridgeHalfLength + lake.bridgeRampLength);
        const sceneCamera = [cx - 4, 22, cz + 10, cx, -4.5, cz];
        window.__camOv = sceneCamera;
        const lakeOptics = {
            foliage,
            reflectionTarget: [targets.reflection.width, targets.reflection.height],
            refractionTarget: [targets.refraction.width, targets.refraction.height],
            reflectionUpdated: targets.reflectionFrame.current > 0,
            transparentOptics: ['tDiffuse', 'uRefraction', 'uPondRadii'].every((key) => Object.hasOwn(window.__polyforkLakeSurface.material.uniforms, key)),
            debugReflectOff: window.__polyforkLakeSurface.material.uniforms.uDebugReflect.value === 0,
        };
        return {
            buildings, vegetation, lake, grass, lakeOptics,
            deckProbe: bridgeSurfaceAt(cx, cz),
            rampMidProbe: bridgeSurfaceAt(rampX, rampZ),
            rampEndProbe: bridgeSurfaceAt(rampEndX, rampEndZ),
            sceneCamera,
        };
    });
    await page.waitForFunction(() => window.__polyforkLakeTargets.reflectionFrame.current > 0, { timeout: 30000 });
    placementEvidence.lakeOptics.reflectionUpdated = true;

    const requiredAssetIds = [
        'brick-tenement-5257e9', 'brownstone-row-house-e58392', 'narrow-walk-up-71d077', 'cast-iron-loft-d05908',
        'corner-shop-db18e2', 'street-diner-bb174e', 'fire-station-a7346f', 'brick-church-6cf1af', 'movie-theater-8c710a',
        'office-tower-8d148a', 'capsule-residential-tower-80300b', 'vertical-farm-tower-77d887', 'monolith-office-tower-422420', 'parking-garage-e1b981', 'subway-entrance-c05ada',
        'palm-tree-a307da', 'tall-pine-tree-ab4108', 'young-pine-0d7695', 'broadleaf-oak-997c22', 'birch-tree-181b33', 'maple-tree-65fa12',
        'cherry-blossom-tree-3f7ab7', 'cherry-tree-a710a9', 'street-tree-0d33f3', 'round-bush-cd2ac0', 'water-blob-f266b8', 'creek-footbridge-d35cf7',
    ];
    const loadedIds = new Set(assetResponses.filter((r) => r.status === 200).map((r) => r.url.split('/').at(-1).replace('.glb', '')));
    for (const id of requiredAssetIds) assert(loadedIds.has(id), `Polyfork asset did not load successfully: ${id}`);
    assert(placementEvidence.buildings.count >= 100, 'Polyfork city building placement count is unexpectedly low');
    assert(placementEvidence.vegetation.trees >= 200 && placementEvidence.vegetation.bushes >= 40, 'Polyfork tree/bush placement count is unexpectedly low');
    assert(placementEvidence.lake.subdividedWaterTriangles >= 1000, 'Lake water mesh was not subdivided for smooth waves');
    assert(placementEvidence.lake.bridgeModules >= 4, 'Footbridge does not contain enough connected Polyfork modules');
    assert(placementEvidence.lake.contactFoamPatches >= 8, 'Shoreline/bridge contact foam is missing');
    assert(placementEvidence.lakeOptics.foliage.legacyStyleLeafMeshes === 9 && placementEvidence.lakeOptics.foliage.bushes >= 40, 'Legacy detailed leaf/shrub overlays are missing');
    assert(placementEvidence.lakeOptics.reflectionTarget[0] <= 256 && placementEvidence.lakeOptics.refractionTarget[0] <= 256 && placementEvidence.lakeOptics.reflectionUpdated, 'Mobile lake optics are not updating at low resolution');
    assert(placementEvidence.lakeOptics.transparentOptics && placementEvidence.lakeOptics.debugReflectOff, 'Fresnel/refraction water optics are not enabled for normal gameplay');
    assert(Math.abs(placementEvidence.deckProbe - placementEvidence.lake.bridgeDeckY) < 1e-6, 'Bridge deck collision height differs from its rendered deck surface');
    assert(Number.isFinite(placementEvidence.rampMidProbe) && placementEvidence.rampMidProbe < placementEvidence.deckProbe, 'Approach ramp does not slope down from the bridge');
    assert(Number.isFinite(placementEvidence.rampEndProbe), 'Approach ramp does not connect to the park floor');
    assert(placementEvidence.grass.bladeSegments === 8 && placementEvidence.grass.outlineMaskAlpha < placementEvidence.grass.outlineMaskThreshold, 'Curved grass blades are not excluded from the outline mask');
    assert(JSON.stringify(placementEvidence.vegetation).includes('palm-tree-a307da') && JSON.stringify(placementEvidence.vegetation).includes('tall-pine-tree-ab4108') && JSON.stringify(placementEvidence.vegetation).includes('broadleaf-oak-997c22') && JSON.stringify(placementEvidence.vegetation).includes('cherry-blossom-tree-3f7ab7') && JSON.stringify(placementEvidence.vegetation).includes('cherry-tree-a710a9') && JSON.stringify(placementEvidence.vegetation).includes('round-bush-cd2ac0'), 'Required Polyfork tree/bush species are not present in the environment batch');

    // Test the real simulation floor snap on both the flat bridge deck and the sloped approach.
    const grounded = await page.evaluate(async () => {
        const { sim, input } = window.__game;
        const lake = window.__polyforkLake;
        const floorAt = window.__bridgeSurfaceAt;
        const [cx, cz] = lake.bridgeCenter;
        const [ax, az] = lake.bridgeAxis;
        const rampX = cx + ax * (lake.bridgeHalfLength + lake.bridgeRampLength * 0.5);
        const rampZ = cz + az * (lake.bridgeHalfLength + lake.bridgeRampLength * 0.5);
        const settle = async (x, z, y) => {
            sim.pos[0] = x; sim.pos[1] = y + 1.3; sim.pos[2] = z;
            sim.vel[0] = 0; sim.vel[1] = -3; sim.vel[2] = 0;
            sim.ground = false; sim.swim = false; sim.wall = null; sim.glideOn = false; sim.web = false; sim.spring = 0;
            input.mx = 0; input.my = 0; input.swing = false; input.jumpHeld = false;
            for (const key of Object.keys(input.keys)) input.keys[key] = false;
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { y: sim.pos[1], ground: sim.ground, expectedY: y + 1 };
        };
        const deck = await settle(cx, cz, floorAt(cx, cz));
        const ramp = await settle(rampX, rampZ, floorAt(rampX, rampZ));
        // Leave the hero at the bridge center for the requested landscape evidence frame.
        const deckY = floorAt(cx, cz);
        sim.pos[0] = cx; sim.pos[1] = deckY + 1; sim.pos[2] = cz;
        sim.vel[0] = sim.vel[1] = sim.vel[2] = 0; sim.ground = true;
        return { deck, ramp };
    });
    console.log(JSON.stringify({ groundingProbe: grounded, deckProbe: placementEvidence.deckProbe, rampMidProbe: placementEvidence.rampMidProbe }, null, 2));
    assert(grounded.deck.ground && Math.abs(grounded.deck.y - grounded.deck.expectedY) < 0.18, 'Hero did not remain grounded on the Polyfork bridge deck');
    assert(grounded.ramp.ground && Math.abs(grounded.ramp.y - grounded.ramp.expectedY) < 0.18, 'Hero did not remain grounded on the Polyfork approach ramp');

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.screenshot({ path: 'art/environment/shot-after-lake-bridge-polyfork-mobile-landscape.png' });
    assert.equal(errors.length, 0, `Browser runtime errors: ${errors.join('; ')}`);
    const result = {
        ok: true,
        viewport: '844x390 phone landscape',
        loadedPolyforkModels: loadedIds.size,
        expectedPolyforkModels: requiredAssetIds.length,
        assetResponses: assetResponses.length,
        placementEvidence,
        grounded,
        errors,
        screenshot: 'art/environment/shot-after-lake-bridge-polyfork-mobile-landscape.png',
    };
    console.log(JSON.stringify(result, null, 2));
    console.log('ENVIRONMENT PASS');
} catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error), placementEvidence: typeof placementEvidence === 'undefined' ? null : placementEvidence, assetResponses, errors }, null, 2));
    console.log('ENVIRONMENT FAIL');
    process.exitCode = 1;
} finally {
    await browser.close();
}
