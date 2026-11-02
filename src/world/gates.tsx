import * as THREE from 'three';
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { WATER_Z } from '../sim';
import { HARBOR } from '../seaWorld';
import { CITY_LOD } from '../SouthSea';
import { QUALITY } from '../quality';
/* phones (GPU-bound on triangles, Shifat's Adreno 506): props are under ~3 px from 120 m out at the phone's world resolution */
const PROP_GATE = QUALITY.coarse ? 120 : 340;

// South Sea 4 phone safety: out at the island / Neon Harbor the full city is hidden; SouthSea draws it as plain hazy boxes instead.
// Small city props (benches, lamps, rooftop clutter: a few metres each) drawn as city-wide instanced batches that frustum culling can never skip.
// Once the camera is >340 m out to sea they are under ~2 px on every device and inside the haze, so the whole batch is skipped there.
export function FarPropGate({ children }: { children: React.ReactNode }) { const ref = useRef<THREE.Group>(null!); useFrame(({ camera }) => { if (ref.current) ref.current.visible = camera.position.z > WATER_Z - PROP_GATE; }); return <group ref={ref}>{children}</group>; }
export function CityGate({ children }: { children: React.ReactNode }) { const ref = useRef<THREE.Group>(null!); useFrame(() => { if (ref.current) ref.current.visible = !CITY_LOD.far; }); return <group ref={ref}>{children}</group>; }

/* perf (Shifat Nov 2 2:17 AM): the harbor's rooftop clutter (~30k triangles) was drawn from everywhere, even the city streets and the island; now only
   where the rest of Neon Harbor's detail is drawn (same distance as NeonHarbor's near group) */
const HGX = (HARBOR.x0 + HARBOR.x1) / 2, HGZ = (HARBOR.z0 + HARBOR.z1) / 2, HG_R = QUALITY.coarse ? 420 : 560;
export function HarborGate({ children }: { children: React.ReactNode }) { const ref = useRef<THREE.Group>(null!); useFrame(({ camera }) => { if (ref.current) ref.current.visible = Math.hypot(camera.position.x - HGX, camera.position.z - HGZ) < HG_R; }); return <group ref={ref}>{children}</group>; }
