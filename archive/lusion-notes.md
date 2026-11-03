# lusion.co render analysis (2026-10-25 02:33-02:40Z, headless SwiftShader, read-only)
MEASURED (WebGL hooks, 412x915@1.75 mobile UA and 1366x768@1):
- getContext('webgl2', {antialias:false, alpha:false, powerPreference:'high-performance'}), stencil false.
- Phone: CSS 412x915 -> drawing buffer 618x1373 = DPR 1.5 (not 1.75). Desktop 1366x768 -> 1.0. Unchanged across ~10 s of scrolling (no dynamic res).
- No renderbufferStorageMultisample calls on either: no MSAA by default.
- One full-res depth texture RT (618x1372 DEPTH24) = scene RT same size as canvas; SMAA area/search PNGs loaded.
- Bloom viewports: phone 154x343 (1/4) + 77x171 (1/8) only; desktop 683x384 (1/2) + 1/4 + 1/8.
- Mouse fluid sim RGBA16F 256x256 phone vs 512x512 desktop.
- Phone loads cross_ld.buf, matcap_ld.exr, stickers_low.png; desktop cross.buf, matcap.exr, stickers.png.
- No KTX2/Basis/Draco/meshopt files; custom quantized .buf geometry.
BUNDLE (hoisted.CUO_IjfL.js, 1.25 MB):
- DPR=Math.min(1.5,devicePixelRatio); USE_PIXEL_LIMIT=!0; MAX_PIXEL_COUNT=2560*1440 (scales width/height down if over)
- webglOpts={antialias:!1,alpha:!1,xrCompatible:!1,powerPreference:"high-performance"}
- checkSceneRt(){this.sceneRenderTarget=properties.isSmaaEnabled?this.sceneFlatRenderTarget:this.sceneMsRenderTarget}; isSmaaEnabled:!settings.USE_HD (USE_HD default false -> SMAA; MSAA path createMultisampleRenderTarget(...,a=8) only with ?USE_HD, skipped on Safari 15.4)
- SMAA defines: SMAA_THRESHOLD "0.1", SMAA_MAX_SEARCH_STEPS "8" (cheap preset), runs on the full-size scene RT
- let e=!browser$1.isMobile||settings.USE_HD; bloom.init({USE_CONVOLUTION:e,USE_HD:e})  -> mobile: no convolution, no half-res level
- Final pass: + hash13(vec3(gl_FragCoord.xy,u_ditherSeed))/255.0 dither; blue-noise texture LDR_RGB1_0.png offset randomly per frame
- Fsr (FSR EASU+RCAS upscaler) class exists but gated settings.UP_SCALE>1, which is not a settings key -> dormant
- Shaders: renderer.compileAsync(scene,camera) per init task during the preloader (KHR_parallel_shader_compile used when present)
- Low-end detection: UA only (isMobile = mobile||tablet; IS_SMALL_SCREEN <=820). No WEBGL_debug_renderer_info, no fps governor. Mobile cuts: _ld meshes/matcaps, _low textures, COUNT=isMobile?48:64, smaller sims.
- No TAA / temporal reprojection.
OURS (proj-r708 read-only): M02s = LOW_END_GPU -> background DPR 0.5-0.75 (LOW_BG_CAP/BG_FLOOR), heroes PHONE_HERO_DPR 1.0, text 1.5-2.0, governor ladder; SMAA HIGH at scene DPR then bilinear/CAS upscale. Lusion: everything at one 1.5 density, SMAA at that density, no upscale.
