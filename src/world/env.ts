import * as THREE from 'three';
import { FOG } from '../sim';

// time of day: one shared state object, materials hold references to its uniform objects and the DayNight component updates them in place
export const TOD = { sun: new THREE.Vector3(-0.55, 0.22, 0.8).normalize(), sunU: null as any, day: { value: 1 }, warm: { value: 1 }, noon: { value: 0 }, fog: new THREE.Color(FOG[0], FOG[1], FOG[2]), sky: new THREE.Color('#c4dcef') };
TOD.sunU = { value: TOD.sun };   // shared sun-direction uniform (set here so every module that builds a material at import time sees it)
// underwater far colour (seabed haze = background, so the seabed plane has no visible far edge) and the underwater flag
export const UWF = { value: new THREE.Color('#176e8c') };
export const UW = { on: false };

/* Half-in/half-out lens (Shifat Oct 31): Scene sets the screen line (ndc: x*a + y*b + c < 0 is under water) and w=1 while the lens straddles the surface.
   The sea surface discards below it (true underworld seen directly) and the post pass fogs that half like diving. */
export const WATERLINE = { v: new THREE.Vector4(0, 0, 1, 0), col: new THREE.Color(), q: Array.from({ length: 7 }, () => new THREE.Vector4(-2, -2, -2, -2)) };   // q: 25 packed ndc heights of the line at ndc x = -1 + k/12 (src/water/waterline.ts)

/* Weather (Shifat Oct 31 5:42 PM: sunny & rainy weather; rain must not get the outline pass; raindrop impacts on water).
   rain: 0..1 shared uniform (every water body reads it for impact rings; DayNight greys the sky/fog by it). The Weather component drives it:
   a slow sunny/rainy cycle, or forced with ?rain=1 / ?rain=0 in the URL. */
export const WEATHER = { rain: { value: 0 }, force: -1 as number, flash: { value: 0 }, bow: { value: 0 }, aur: { value: 1 }, aurForce: -1 as number, fdir: { value: new THREE.Vector3(0, 0.1, -1) } };   /* flash/fdir: storm lightning (src/world/weather.tsx), lights the sky dome + sea */
