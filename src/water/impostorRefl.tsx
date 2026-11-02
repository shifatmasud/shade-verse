import * as THREE from 'three';

/* REFLECTION IMPOSTORS (Shifat Nov 1 3:11 PM 'new batch of reflection methods', batch B): each big landmark is rendered ONCE at load from its real
   meshes into an elevation card (orthographic side view: real colours, windows, roofs). The sea intersects its reflected ray with the card's
   vertical plane and reads the card there - exact position and parallax, real art, no per-frame render. Cards: 0 city waterfront (plane z),
   1 bridge (plane x), 2 harbor north face (plane z). */
export const IMP_N = 3, IMP_HMAX = 140;
export const IMP_P = Array.from({ length: IMP_N }, () => new THREE.Vector4(0, 1e6, 0, 1));   // x: axis (0 = plane z = y, u along x; 1 = plane x = y, u along z), y: plane coord, z: u0, w: u size
export const IMP_TEX: (THREE.Texture | null)[] = [null, null, null];
export const IMP_ON = typeof location !== 'undefined' && /[?&]imp\b/.test(location.search);
