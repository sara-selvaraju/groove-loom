# Credits

## Samples

All samples live in `prototype/sounds/`.

### Drums: `sounds/drums/`

From the [Versilian Community Sample Library (VCSL)](https://github.com/sgossner/VCSL) by Sam Gossner, released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No attribution is required; it is given here as thanks.

Each file was converted to mono 16-bit 44.1 kHz WAV, trimmed to start at the hit, shortened with a short fade, and normalised. Sources:

| File | VCSL source |
|---|---|
| kick.wav | Membranophones/Struck Membranophones/Bass Drum 1/BDrumNew_hit_v7_rr1_Sum.wav |
| snare.wav | Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v7_rr1_Mid.wav |
| rim.wav | Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_stick_v1_rr1_Mid.wav |
| clap.wav | Idiophones/Struck Idiophones/Claps/Clap_rr1.wav |
| hihat.wav | Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitC_v3_rr1_Mid.wav |
| openhat.wav | Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitO_rr1_Mid.wav |
| tom.wav | Membranophones/Struck Membranophones/Tom 2/Stick/TomL_HitS_v4_rr1_Mid.wav |
| tomhi.wav | Membranophones/Struck Membranophones/Tom 1/Stick/TomH_HitS_v4_rr1_Mid.wav |
| shaker.wav | Idiophones/Struck Idiophones/Shaker, Small/Mid_ShakerHighFaster_Down_rr1.wav |
| tambourine.wav | Idiophones/Struck Idiophones/Tambourine 1/Tamb1_Hit_v2_rr1_Mid.wav |
| crash.wav | Idiophones/Struck Idiophones/Suspended Cymbal 1/susCymb1_hit_stick_f1.wav |

### Instruments: `sounds/<instrument>/<note>.mp3`

From the Fluid R3 GM SoundFont by Frank Wen, rendered to MP3 by Benjamin Gleitzman in [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (`FluidR3_GM`), licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Files are unmodified; every third semitone is included and Strudel repitches between them.

| Folder | General MIDI instrument |
|---|---|
| piano | acoustic_grand_piano |
| epiano | electric_piano_1 |
| ebass | electric_bass_finger |
| guitar | acoustic_guitar_nylon |
| strings | string_ensemble_1 |
| trumpet | trumpet |
| sax | tenor_sax |
| flute | flute |
| vibes | vibraphone |

The app shows this attribution under the code panel. Keep it visible in any fork that ships these samples.

## Code

- Strudel (`@strudel/web` 1.3.0), AGPL-3.0. The files `prototype/superdough-processors.js`, `prototype/dough-processor.js`, `prototype/recorder.js` and `prototype/sample-generator.js` are Strudel's own audio worklets, extracted unchanged from that bundle.
- three.js r128, MIT.
- lamejs 1.2.1, LGPL-3.0.
