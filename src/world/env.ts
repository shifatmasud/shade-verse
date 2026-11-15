import * as THREE from 'three';
import { FOG } from '../sim';

// time of day: one shared state object, materials hold references to its uniform objects and the DayNight component updates them in place
export const TOD = { sun: new THREE.Vector3(-0.55, 0.22, 0.8).normalize(), sunU: null as any, day: { value: 1 }, warm: { value: 1 }, noon: { value: 0 }, fog: new THREE.Color(FOG[0], FOG[1], FOG[2]), sky: new THREE.Color('#c4dcef') };
TOD.sunU = { value: TOD.sun };   // shared sun-direction uniform (set here so every module that builds a material at import time sees it)
// underwater far colour (seabed haze = background, so the seabed plane has no visible far edge) and the underwater flag
export const UWF = { value: new THREE.Color('#176e8c') };
export const UW = { on: false };
/* Shifat Nov 15 7:06 PM 'screen to world space': one water medium for the dive and the split lens, measured in metres along each view ray.
   UWP.v = (1 while fully under, surface y at the lens, fog near, fog far) - the post pass and the scene fog read the same numbers. */
export const UWP = { v: new THREE.Vector4(0, -1e4, 8, 150), on: { value: 0 } };
/* Seawater absorption per metre (Pope & Fry 1997 pure water ~0.45 / 0.07 / 0.02 at 650 / 550 / 450 nm, scaled 0.12 for the game's clear
   tropical read - the same law the kelp has used since Oct 29): reds go first, then greens, blue carries furthest. Beer-Lambert: c * exp(-k d). */
export const UW_ABS = 'vec3(0.054, 0.0084, 0.0024)';
/* Every fogged material under water: the same absorption by its own distance (per fragment, so a bubble 1 m away stays white while the
   seabed 20 m off has lost its reds), then the existing haze law. Gated on the underwater fog (Scene pushes it to 1e4 m above water). */
THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );',
    `#ifndef FOG_EXP2
	if (fogNear < 1000.0) gl_FragColor.rgb *= exp(-${UW_ABS} * vFogDepth);
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );`);

/* Half-in/half-out lens (Shifat Oct 31): Scene sets the screen line (ndc: x*a + y*b + c < 0 is under water) and w=1 while the lens straddles the surface.
   The sea surface discards below it (true underworld seen directly) and the post pass fogs that half like diving. */
export const WATERLINE = { v: new THREE.Vector4(0, 0, 1, 0), col: new THREE.Color(), q: Array.from({ length: 7 }, () => new THREE.Vector4(-2, -2, -2, -2)) };   // q: 25 packed ndc heights of the line at ndc x = -1 + k/12 (src/water/waterline.ts)

/* Weather (Shifat Oct 31 5:42 PM: sunny & rainy weather; rain must not get the outline pass; raindrop impacts on water).
   rain: 0..1 shared uniform (every water body reads it for impact rings; DayNight greys the sky/fog by it). The Weather component drives it:
   a slow sunny/rainy cycle, or forced with ?rain=1 / ?rain=0 in the URL. */
export const WEATHER = { rain: { value: 0 }, force: -1 as number, flash: { value: 0 }, bow: { value: 0 }, aur: { value: 1 }, aurForce: -1 as number, fdir: { value: new THREE.Vector3(0, 0.1, -1) } };   /* flash/fdir: storm lightning (src/world/weather.tsx), lights the sky dome + sea */
