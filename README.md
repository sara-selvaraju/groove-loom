# Groove Loom

Groove Loom lets anyone make music by describing it in plain words, then shaping it with a few knobs. Each request becomes a layer: "start me off with a 4/4 beat", "throw in a syncopated trumpet", "make it groovier". As the music plays, a loom weaves it into a tapestry: one coloured thread per layer, raised wherever that layer sounds.

It is built for people who are not musicians, as a way to explore the language, shape and maths of music. The [Strudel](https://strudel.cc) code that makes the sound stays behind the scenes, with an option to look under the hood.

## Status

`prototype/` holds the working prototype: a single HTML page first built and published as a claude.ai artifact. It has been ported into a proper web app under `src/` with the same behaviour; the prototype stays as the reference until the app is confirmed to match it. The AI runs through the server with a shared invite code while it is being tested. See [CLAUDE.md](CLAUDE.md) for the brief and the first tasks, and [docs/design-decisions.md](docs/design-decisions.md) for why things are the way they are.

## Develop the app

Needs Node 22.

```sh
npm install
npm run dev
```

This starts the front end on http://localhost:5173 with the server behind it. Checks, releases and hosting are covered in [docs/deployment.md](docs/deployment.md).

## Run the prototype

Serve the folder with any static file server, then open it in a browser:

```sh
python3 -m http.server 8000 -d prototype
# or: npx serve prototype
```

Playback, the knobs, mute, solo, undo, the tapestry and MP3 recording all work locally. Two features depend on the claude.ai artifact runtime and are switched off elsewhere:

- **AI requests** use the artifact's `sample` capability to call Claude. Outside claude.ai the page says the AI is unavailable.
- **Saving files** (MP3 and cloth image) uses the artifact's `downloads` capability.

The plan for replacing both, and for hosting on Railway, is in the brief.

## How it works

1. A request goes to Claude with the current piece and a fixed vocabulary of instruments, keys, scales and rhythm notation.
2. Claude replies with a structured description of the piece (layers, notes, rhythm, knob values) and a short plain-words explanation. It never returns code.
3. The app validates every field against a whitelist, then compiles the description into a Strudel pattern. The code view is generated from the same compiled calls, so it always matches what is playing.
4. Strudel plays the pattern in the browser, using recorded drums and instruments published with the page.
5. The tapestry renderer reads the same pattern and weaves each bar as it plays.

## Credits and licence

- Audio engine: [Strudel](https://strudel.cc), AGPL-3.0.
- Drum samples: [Versilian Community Sample Library](https://github.com/sgossner/VCSL), CC0.
- Instrument samples: Fluid R3 GM by Frank Wen, via [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Font: [Recursive](https://www.recursive.design) by Arrow Type, SIL Open Font License 1.1.
- 3D rendering: [three.js](https://threejs.org), MIT.
- MP3 encoding: [lamejs](https://github.com/zhuker/lamejs), LGPL-3.0.

Groove Loom is licensed under the GNU Affero General Public License v3.0 (see [LICENSE](LICENSE)), matching Strudel. Forks are welcome. See [CREDITS.md](CREDITS.md) for sample attribution details.
