import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
/* city/tree/bridge/lily .glb files are meshopt-compressed (2.8 MB -> 0.56 MB); every GLTFLoader that reads them needs the decoder */
export const withMeshopt = (loader: GLTFLoader) => { loader.setMeshoptDecoder(MeshoptDecoder); };
