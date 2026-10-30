import { ISLAND } from '../seaWorld';
import { waveSumJS } from './waves';
import { isLakeWater, lakeWaveH, waterSurfaceAt, WATER_Y } from '../sim';

// CPU-side water height (swimming, boats, bubbles, camera): matches the ocean shader's wh() and the lake surface.
export function waveH(x: number, z: number, t: number) {
    const zk = Math.max(0, Math.min(1, (z + 300) / -450)), ik = Math.max(0, Math.min(1, (Math.hypot(x - ISLAND.cx, z - ISLAND.cz) - 105) / 110)), sk = (1 + 1.3 * zk * zk * (3 - 2 * zk)) * (0.22 + 0.78 * ik * ik * (3 - 2 * ik));
    return sk * waveSumJS(x, z, t);   /* same table + summation order as the shader's wh() (src/water/waves.ts) */
}
export function waveAtWater(x: number, z: number, t: number) { return isLakeWater(x, z) ? lakeWaveH(x, z, t) : waveH(x, z, t); }
export function waterRenderY(x: number, z: number, t: number) { return isLakeWater(x, z) ? waterSurfaceAt(x, z, t) : WATER_Y + waveH(x, z, t); }
