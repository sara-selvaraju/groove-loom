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

## Hosting, CI/CD and who pays for the AI

- **Railway** hosts the app, deployed through a proper pipeline rather than from a laptop: GitHub Actions runs the checks; staging autodeploys from `main` only after they pass (Railway's Wait for CI); production deploys from version tags behind an approval step.
- **Prototype and testing phase:** the project owner pays for API usage through a server-held key. Because the URL is public, the endpoint is protected with an access gate, rate limits, output caps and a spend limit on the key.
- **Production phase:** users bring their own key and choose their own model. Keys stay in the user's browser and requests go directly to the provider, so the service never holds anyone's credentials. This also keeps running costs near zero for the project and for anyone who forks it.
- Both phases sit behind one `Composer` interface, so moving from phase 1 to phase 2 adds code rather than rewriting it, and every response still passes the same validation.

## Visual design: a weaving studio in daylight

The first redesign after the port, made because the page needed more life and the loom more room.

- **The loom is the one bold thing.** It takes about two thirds of the width and most of the screen's height, with the conversation beside it. Playback and the whole-piece controls sit in one strip below; the layers sit below that as cards, several across rather than one long list.
- **Always light.** A cool daylight room (not warm cream) gives the fabric space, with deep indigo ink for text and buttons so the threads carry all the colour. The page does not follow the device's dark mode; dark colours remain in the stylesheet behind `data-theme="dark"` for a possible switch later.
- **Dyed thread colours.** Eight saturated colours named after natural dyes (madder, weld, verdigris, woad, saffron, cochineal, teal, logwood), ordered so neighbouring layers differ in hue.
- **Layers as yarn cards.** Each card has a strip of wound thread in the layer's colour, and draws its rhythm as a row of squares like weaver's draft paper, read from the compiled pattern so it always matches what plays. This shows the maths directly: "3 hits over 8 steps" is visible.
- **Sentence case, no all-caps labels.** Recursive stays, with its casual axis used in headings.
- **Loom vibrancy.** Between hits a layer's band is a softer tint, so each hit stands out in full colour; silent layers and preview bars are less washed out; brighter, warmer light on the yarn and the wood.

The second pass made the loom itself more realistic (`src/web/loom-frame.ts`):

- A wooden frame: side rails running the length of the loom and a front beam, with wood grain drawn once on a canvas and tinted by the theme. The camera pulls back slightly so the rails are in view.
- The space in front of the cloth is laid out as on a real loom: the weaving edge, then the shuttle's path, then the reed. Bare warp shows between them.
- A reed with a wooden top and bottom bar and 96 steel teeth, which swings in to pack each new bar.
- A boat-shaped shuttle carrying a bobbin of yarn in the first layer's colour, crossing as each bar is woven.
- In the cloth: darker selvedges, and a soft shadow just behind the weaving edge.
- A soft fill light from the weaver's side, so the faces of the reed, shuttle and beam are not in shade. Steel is kept mostly non-metallic because, with nothing to reflect, true metal renders black.

## The notes carry the colour

Seen on real hardware with six layers, the redesigned cloth read as stripes rather than music: every layer had a coloured band across the full width whether it played or not, so the notes were only slightly brighter bumps, sustained layers were solid stripes, and sixty identical preview bars looked like wallpaper.

- **Notes in full colour, everything else nearly undyed.** Between notes a layer's row is a faint tint of its colour (so the row can still be found); a muted layer is almost undyed. Notes are raised, a touch richer in colour, with more sheen and soft shadows on the cloth around them. The rhythm is now the pattern: four kicks and two snares per bar are visible at a glance.
- **Start from bare warp.** Before anything is woven, the loom shows bare warp with only the first bar sketched faintly at the weaving edge, so pressing play grows the cloth from nothing.

## Open questions

- Where forkers are most likely to extend: visualisers, instrument packs, the AI's musical vocabulary, or all three. This decides where the extension points go.
- Which providers and models to offer in phase 2, decided by the eval set rather than by reputation.
