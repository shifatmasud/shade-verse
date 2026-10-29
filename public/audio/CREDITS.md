# Shade Verse audio credits and licenses

Total shipped audio: see the sizes below. A player downloads one format only (Ogg Vorbis, or MP3 where the browser lacks Vorbis, e.g. Safari),
and only what it needs: the score and the step sprite after the first tap, the bird bed only near the park/lake.

## Synthesized in the browser (no files, original work, CC0)
All ambience beds and every hero / enemy / UI sound effect are generated at runtime by `src/audio/synth.ts` (WebAudio oscillators,
noise and filters rendered once through an OfflineAudioContext): city hum + traffic + horns, distant sirens, wind, ocean waves,
lake lapping, leaves rustle, crickets, underwater rumble + bubbles, glide flutter, swing air rush, web thwip, web attach, swing whoosh,
web spring, Web Shock charge + zap, punches, melee swish, landing thuds, jump, splash, orb chime, hurt, robot metal hits, robot KO,
boss hit + boss KO, title "start" hit, and the hooks for the coming Iron Man-style weapons (repulsor charge + bolt, unibeam charge,
fire burst and beam loop). Made for Shade Verse by Tab; dedicated to the public domain (CC0 1.0).

## Score (original, CC0)
| file | what | source | license |
|---|---|---|---|
| music_title.ogg / .mp3 | title theme, 72 BPM, D minor, 26.7 s loop | composed and synthesized for Shade Verse (`tools/audio/build_audio.py`) | CC0 1.0 |
| music_explore.ogg / .mp3 | adaptive score, calm layer (strings, cello drone, celesta motif), 92 BPM, 20.9 s loop | same | CC0 1.0 |
| music_action.ogg / .mp3 | adaptive score, action layer (spiccato ostinato, taiko, brass swells), sample-locked to the calm layer | same | CC0 1.0 |

## Recorded samples (freesound.org, all Creative Commons 0)
| file | used for | original sound | author | license |
|---|---|---|---|---|
| steps.ogg / .mp3 (0.00-1.28 s) | concrete footsteps (4 takes) | [Footsteps - Stone, Rock, Concrete, Cement](https://freesound.org/people/SecureSubset/sounds/813622/) (#813622) | SecureSubset | CC0 1.0 |
| steps.ogg / .mp3 (1.28-2.56 s) | grass footsteps (4 takes) | [Hiking Boot Footsteps on Grass](https://freesound.org/people/Fission9/sounds/521587/) (#521587) | Fission9 | CC0 1.0 |
| steps.ogg / .mp3 (2.56-3.84 s) | sand footsteps (4 takes) | [Footsteps_Mountain_Boots_Wet_Sand_Sequence_Mono](https://freesound.org/people/Nox_Sound/sounds/564893/) (#564893) | Nox_Sound | CC0 1.0 |
| birds.ogg / .mp3 | daytime birds near the park trees (20 s loop, high-passed) | [forest-bird (2)](https://freesound.org/people/sama66/sounds/462136/) (#462136) | sama66 | CC0 1.0 |

The CC0 status of each recording was read on its freesound page on 2026-10-29. The samples were trimmed, filtered, normalised and re-encoded.

## Sizes
| file | bytes |
|---|---|
| birds.mp3 | 100,406 |
| birds.ogg | 125,494 |
| music_action.mp3 | 209,286 |
| music_action.ogg | 209,909 |
| music_explore.mp3 | 209,286 |
| music_explore.ogg | 127,803 |
| music_title.mp3 | 267,278 |
| music_title.ogg | 155,829 |
| steps.mp3 | 31,181 |
| steps.ogg | 36,625 |

Ogg set (what Chrome / Firefox / Android download): 640 KB. MP3 set (Safari): 798 KB. Both sets in the repo: 1439 KB.
