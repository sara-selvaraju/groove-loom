# Design decisions

A record of what was decided while designing the prototype, and why. Newest entries are at the bottom.

## Audience and purpose

- **Audience: curious non-musicians.** Musicians already have their own tools. Groove Loom is for anyone who wants to tinker.
- **Purpose: exploration first, teaching second.** The aim is for people to appreciate the language, shape and mathematical patterns of music while feeling they are creating something of their own.
- **Code hidden by default, with a way to look.** The exploration, with the AI's help, is the main experience. Strudel stays behind the scenes, and an "under the hood" panel shows the generated code for anyone curious.
- **Forkable.** The repo should be structured so others can fork it and build their own things. AGPL-3.0, matching Strudel.

## The AI hands over data, not code

The first idea was for the AI to write Strudel code directly. That was rejected: Strudel code is JavaScript, so a shared link containing code would run someone else's code in the viewer's browser, and an AI writing code is exposed to prompt injection.

Instead the AI returns a structured description of the piece, which the app validates and compiles. Trade-off accepted: less expressive freedom than raw Strudel, in exchange for safety, shareable links that carry only data, and knobs that map directly onto fields of the model.

## Interaction model

- Each request adds or edits a named layer (drums, bass, trumpet). Every change goes into an undo history.
- Global controls: tempo, key, scale, swing. Per-layer controls: volume, tone, space (reverb), mute, solo. Rhythm layers built from even spacing also get hits, steps and rotate, which is a Euclidean rhythm in disguise.
- Vague requests get a confident choice, explained in one line ("put it in D minor, it suits the moody feel you asked for"). That explanation is where the teaching happens.

## Visualisation

The visual went through four versions:

1. **Rhythm wheel.** Concentric rings, one per layer, with dots for hits. Rejected as too musical: it asks people to read a clock, and it does not grow as they build.
2. **Woven cloth, flat grid.** Each bar weaves one band; each layer is a thread that shows on the surface while it plays. The metaphor landed (and gave the project its name), but the drawing read as a grid of coloured dashes, not cloth.
3. **Brocade, flat canvas.** A twill ground cloth with coloured floats over it, shaded threads, a shuttle and bare warp. Read as fabric. Refined on request: newest bars at the bottom rather than the top, and thinner threads.
4. **Tapestry on a loom, 3D.** A three.js scene: a tilted loom bed, beater bar, shuttle and front beam, with the tapestry pushed away into the distance as it is woven. The surface is weft-faced tapestry drawn by a shader: packed round yarns rising over every other warp, giving the pebbled rib texture of real tapestry, with light and sheen, small dye variation between yarns, and interlocking teeth where a colour starts or stops. This is the current design. The flat brocade renderer remains as the fallback when WebGL is unavailable.

What the tapestry encodes:

- One band per bar; newest at the weaving edge, near the bottom of the view.
- One coloured band per layer, two yarns deep, with plain ground picks between layers.
- Full colour and slightly raised while the layer sounds; muted colour while it is silent.
- Higher notes woven in a paler shade of the layer's colour.
- The first pick of each bar a shade darker, so bars can be counted.
- A label such as "+ Trumpet" or "~ Bass" on the bar where a change happened, so a person can see what just changed without losing everything built so far.

## Sound

- **First version: synths only.** Every instrument was a raw oscillator recipe, because the artifact sandbox could not download Strudel's sample libraries. Feedback: it sounded 8-bit next to strudel.cc.
- **Current: recorded samples published with the page.** Drums from VCSL (CC0); instruments from Fluid R3 GM (CC BY 3.0), the same family as Strudel's `gm_` sounds. Libraries were chosen for open licences suitable for a forkable repo. About 4 MB in total, fetched per instrument on first use.
- Synth instruments remain for electronic or retro requests.
- Levels were measured per instrument and balanced, and a limiter sits on the master output.
- The tone control was remapped so its midpoint is the instrument's natural sound.

## Phone audio

On iPhone the page played silently while the shuttle moved. Two causes, both fixed:

1. Audio has to be started synchronously inside the tap. The play button originally awaited the audio engine first, so the browser no longer treated the call as part of the tap.
2. iPhones mute Web Audio when the ringer switch is on silent, unless the page is playing a media element. A looping, near-silent WAV plays alongside the music to mark the page as a media player.

## Open questions

- Hosting and cost control for the AI backend.
- Whether the public version uses a server-held key with rate limits, lets people bring their own key, or both.
- Where forkers are most likely to extend: visualisers, instrument packs, the AI's musical vocabulary, or all three. This decides where the extension points go.
