# Feature Backlog & Status Inventory

Total requests extracted from project history: 68.

## Group 1: Implemented in Export & Verified in Repository (60 items)
1. Browser 3D game engine (React 18, Three.js, R3F, Framer Motion, GSAP, WebGL2, Vite)
2. Version control via GitHub (shifatmasud/web-swinger-3d)
3. Deployment on Vercel (https://web-swinger-3d-eight.vercel.app/)
4. Target device performance architecture (adaptive scaling, lightweight shader passes)
5. Touch controls & landscape viewport (100dvh, fullscreen on play, portrait dropped)
6. Landscape menu layout fix (prevent clipping in mobile landscape)
7. Research-patch-build-test-review-document-report loop with 100-point scorecard
8. Spider Bench reference implementation (original math and traversal, no copied code/assets)
9. Original hero character model (Shadow: hooded, masked, navy/gold suit, purple lenses, chest logo, cape)
10. Model and UI locked in Lock.md (cape animation rig weights unlocked for flight/glide)
11. Minimalist UI (custom icons, zero in-game text during play, glassmorphic styling, contextual D-pad)
12. Street-level walking, running, jumping, landing mechanics
13. Hard landing stun and damage scaling from fall velocity (>26 m/s)
14. Higher jump apex (raised to 4.6 m)
15. Running speed tuned (11 m/s) and floor collision guard
16. Web swinging mechanics (alternating hands, hand-origin attachment)
17. Spring-shot jump (dual-hand simultaneous launch)
18. Web shot attack (dual-hand web projectiles)
19. Web zip-up when swinging from street level
20. Mid-air glide with outstretched arms and reactive cape
21. Continuous powered flight on held jump during glide or fall
22. Auto-glide when mid-air, jump tap to cancel/stop glide
23. Wall crawling
24. Wall running (faster wall crawl transitions into wall run stride)
25. Wall jump and rooftop vaulting
26. Automatic wall-crawl trigger on building contact during swing/grab
27. Surface swimming and underwater diving (jump tap underwater transition, inverted icon)
28. Water entry and exit transitions with momentum exit leap
29. Water physics optics (Fresnel sky reflection and underwater refraction)
30. Water spray on impact and surface landings
31. Water ripples, wake trail, and directional change wake fix
32. Underwater visuals (fog, tint, lighting passes)
33. Air/water split view at waterline
34. Calm lighter lake coloration situated underneath bridge
35. Bridge over lake
36. Ocean area with shoreline water foam
37. Free manual camera orbit with smart movement-based tracking (GTA-style)
38. Day/night cycle with atmospheric variation (morning, day, evening, calm starry night)
39. Distance depth blur, exponential fog, cinematic lighting, parallax windows
40. Alpha-tested foliage for trees and bushes (scanned textures, not 3D polygon cones)
41. Realistic tree varieties, distinct families, pine trees with needle textures
42. Dense thin grass blades with subtle flowers and glowing fireflies
43. Calmer grass green colors (muted sage/olive)
44. Polyfork environment models for buildings, trees, and vehicles
45. Polyfork six-home residential block / neighborhood
46. Cell-based world rendering and culling for weak GPUs
47. GPU instancing for crowds, vegetation, vehicles, outlines
48. Screen-space comic outline shader for buildings and world objects
49. Robot civilian pedestrians using Shadow body topology
50. Minimal robotic faceplates (smooth visor, eye slits/dots, no mouth/nose)
51. Pedestrian eye color (blue)
52. Enemy eye color (red)
53. Full-body covered pedestrian suits
54. Armored enemy units (heavy chest, shoulder, limb armor)
55. Enemy variety (trooper, heavy walker, survey quad drone)
56. Grounded dome robots (restricted from high flight)
57. High crowd density without pop-in (world-fixed slots, distance alpha fades)
58. Crowd distance LOD and staggered enemy strikes
59. Bot scale 1.2x hero size
60. Visual death explosion effect with debris on bot KO

## Group 2: Still Queued / In Progress (6 items)
61. Plasma web projectile weapon (auto-targeting, homing, radial shockwave blast) - code implemented in commit 0c55f56, visual FX refinement in progress
62. Insomniac Spider-Man 2 martial arts combat flow & web combo choreography - footage analyzed (YouTube D9xHicWET3I), transition timing in progress
63. Second hero companion character: Ghost (female hero companion in white suit, swings/walks/fights alongside Shadow) - active in InstaBox
64. Giant boss (muscular white humanoid body, red eyes, no mouth, 5x hero size) - queued
65. Detailed flying cars with collision pass and web anchor towing - queued
66. Water surfing (hold swing on water surface, wake spray, web-tow surfing) - queued
67. Building destruction (three-bvh-csg mesh subtraction, breakable sections, debris) - queued
68. Armored military vehicles (tanks and hunter helicopters as rare heavy threats) - queued

## Group 3: Not Verifiable Now on Physical Hardware (2 items)
- Physical device 60fps frame rates on Android 10 (Chrome 155) and Windows 10 (Edge 155 / Intel UHD 600) (untested on physical hardware; estimated via GPU feature flags and code analysis)
- Mobile hardware audio output and haptic vibration (untested on physical phone; verified via Web Audio API node assertions)
