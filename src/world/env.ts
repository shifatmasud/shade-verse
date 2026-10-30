import * as THREE from 'three';
import { FOG } from '../sim';

// time of day: one shared state object, materials hold references to its uniform objects and the DayNight component updates them in place
export const TOD = { sun: new THREE.Vector3(-0.55, 0.22, 0.8).normalize(), sunU: null as any, day: { value: 1 }, warm: { value: 1 }, noon: { value: 0 }, fog: new THREE.Color(FOG[0], FOG[1], FOG[2]), sky: new THREE.Color('#c4dcef') };
// underwater far colour (seabed haze = background, so the seabed plane has no visible far edge) and the underwater flag
export const UWF = { value: new THREE.Color('#176e8c') };
export const UW = { on: false };
