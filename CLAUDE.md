# Groove Loom: project brief

## What this is

A music toy for people who are not musicians. A person describes music in plain words ("start me off with a 4/4 beat", "throw in a syncopated trumpet"), Claude turns each request into a layer, and knobs shape the result. While it plays, a loom weaves the music into a tapestry: one coloured thread per layer, raised wherever that layer sounds.

The purpose is exploration with a side of teaching: helping people notice the language, shape and mathematical patterns of music. The Strudel code is hidden by default, with an "under the hood" panel for anyone who wants to learn what it is doing.

The repo is meant to be forked. Licence is AGPL-3.0 to match Strudel.

## Current state

`prototype/index.html` is a working single-file prototype (about 1,240 lines), originally a claude.ai artifact. It is the reference implementation: behaviour, look and copy are all agreed. Do not treat it as throwaway; port it.

Sections in `prototype/index.html`, in order:

| Line (approx.) | Section | Notes |
|---|---|---|
| 237 | Vocabulary | `KEYS`, `SCALES`, `INSTR` (instrument table: recorded drums, recorded instruments, synths), `INSTR_ALIASES` |
| 283 | Recorded sounds | `samples()` registration, `preloadFor()` fetches a piece's samples before playing |
| 312 | Starter piece | example groove shown on first load |
| 333 | Validation | `sanitizePiece()`: every field from the AI or storage is clamped or whitelisted here |
| 384 | Compiler | `layerCalls()` builds a list of Strudel calls; `compile()` turns it into a pattern, `codeFor()` into the code listing |
| 446 | Flat cloth | 2D canvas renderer; now the fallback, and still used by Save cloth |
| 637 | Tapestry | three.js scene plus a fragment shader that draws weft-faced tapestry from a data texture |
| 996 | Update cycle | undo stack, debounced rebuilds |
| 1028 | Audio | Strudel init, master limiter, phone audio unlock |
| 1082 | AI | `buildPrompt()` and the request flow |
| 1159 | MP3 export | taps the master output, encodes with lamejs |

## Decisions that should survive the port

Full reasoning is in [docs/design-decisions.md](docs/design-decisions.md). The short version:

1. **The AI returns data, never code.** Claude replies with `{reply, piece}`: a structured description of layers, notes, rhythms and knob values. The app validates it and compiles it to Strudel. Shared pieces carry data only. This is the main defence against prompt injection and against running someone else's code from a link.
2. **One source of truth for sound and code view.** `layerCalls()` produces one call list that drives both the audio and the displayed code. Keep it that way so the code panel can never drift from what plays.
3. **Whitelisted vocabulary.** Instruments, keys and scales come from fixed lists. Note and rhythm strings must match strict character patterns and parse as Strudel mini-notation before they are accepted. Unknown instruments are dropped; old names are mapped through `INSTR_ALIASES`.
4. **Plain-words explanations.** The AI's reply explains each change without jargon and points out the shape or maths where natural (for example "3 hits spread evenly over 8 steps"). When a request is vague, it makes a confident choice and says what it chose.
5. **Recorded sounds by default, synths on request.** Drums are VCSL (CC0), instruments are Fluid R3 GM (CC BY 3.0, credit shown in the UI). Synth sounds stay for electronic or retro requests.
6. **Tone 0.5 means natural.** Below darkens with a low-pass filter; above opens it fully. The earlier mapping dulled recorded samples.
7. **A limiter on the master output** so eight layers cannot clip. Recording taps the limiter's output.
8. **The tapestry encodes the music.** Each bar is a band, newest at the weaving edge near the bottom of the view, older bars pushed away into the distance. Each layer is a coloured band two yarns deep: full colour and slightly raised while it sounds, muted colour while silent, paler for higher notes. The first pick of each bar is a shade darker, a bar line. Labels such as "+ Trumpet" mark the bar where a change happened.
9. **Phones need audio started inside the tap.** `unlockAudio()` runs synchronously in the click handler, and a looping near-silent media element stops iPhones muting Web Audio when the ringer switch is on silent. Without both, the shuttle moves but nothing is heard.

## Claude.ai artifact workarounds to remove in the port

These exist only because the prototype ran inside the claude.ai artifact sandbox:

- **AI calls** go through `claude.use("sample")`. Replace with a small backend endpoint that calls the Claude API, keeps the API key server-side, asks for the same JSON shape (ideally via tool use or structured outputs with a JSON schema), and rate-limits. Validate on the server and again in the client.
- **Saving files** goes through `claude.use("downloads")`, and the MP3 is wrapped in a zip because that capability would not accept `.mp3`. Replace with a normal download of the `.mp3` directly.
- **Audio worklet redirect.** Strudel embeds its worklets as `data:` URLs, which the artifact security policy blocked, so a shim rewrites them to the extracted files next to the page. In a normal app, either drop the shim or keep the files and set a policy that allows them.
- **Libraries from CDNs** (`@strudel/web` 1.3.0, three r128, lamejs 1.2.1) were loaded as UMD scripts because the artifact could not bundle. Use npm packages and ES modules instead; current three.js no longer ships UMD builds.
- **Browser storage** holds the current piece and chat for one viewer only. Fine to keep for drafts; share links (below) replace it for sharing.

## Known gaps

- Save cloth still exports the flat 2D style, not the tapestry.
- The tapestry rebuilds the whole data texture every frame while playing. Fine on desktop; may stutter on older phones. Only the live bar changes, so incremental updates are an easy win.
- MP3 recording uses `ScriptProcessorNode`, which is deprecated. Move to an AudioWorklet recorder.
- No share links yet. The plan was a URL that encodes the piece JSON (compressed), so links carry data, never code.
- No tests.
- Notes far outside an instrument's sampled range are repitched heavily and can sound odd.
- The AI prompt has had little tuning against real requests.

## First tasks (suggested order, tracer bullet first)

1. **Scaffold** a Vite + TypeScript app. Port the prototype into modules with no change in behaviour: `vocabulary`, `piece` (types and `sanitizePiece`), `compiler`, `audio`, `ai`, `tapestry`, `flat-cloth`, `export`, `ui`. Keep `prototype/` as the reference until the port matches it.
2. **Tests** for the parts where a bug would hurt most: `sanitizePiece` against hostile and malformed input, the mini-notation whitelist, and `compiler` (piece in, call list and code listing out, as snapshots).
3. **AI backend**: one endpoint, server-held key, schema-checked JSON out. Hosting is an open decision.
4. **Share links**: piece JSON compressed into the URL.
5. **Tapestry**: incremental texture updates, ES-module three.js, Save cloth rendered from the tapestry itself.
6. **Export**: AudioWorklet recorder, direct MP3 download, optional WAV.

## Conventions

- UI copy and docs use Australian English.
- No em dashes in UI copy or docs.
- Docs use role-based phrasing ("the request is validated against the whitelist") rather than personal pronouns.
- UI copy names things the way a non-musician would recognise them; any music term is explained in the same breath.
- Keep the sample credits visible in the UI.
