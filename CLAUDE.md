# Groove Loom: project brief

## What this is

A music toy for people who are not musicians. A person describes music in plain words ("start me off with a 4/4 beat", "throw in a syncopated trumpet"), Claude turns each request into a layer, and knobs shape the result. While it plays, a loom weaves the music into a tapestry: one coloured thread per layer, raised wherever that layer sounds.

The purpose is exploration with a side of teaching: helping people notice the language, shape and mathematical patterns of music. The Strudel code is hidden by default, with an "under the hood" panel for anyone who wants to learn what it is doing.

The repo is meant to be forked. Licence is AGPL-3.0 to match Strudel.

## Current state

**App skeleton (task 1).** A Vite + TypeScript front end in `src/web`, a Hono server in `src/server` (serves `dist/web` and `/healthz`, sets a strict Content Security Policy), CI in `.github/workflows/ci.yml`, production deploys from tags in `.github/workflows/deploy-production.yml`, and Railway settings in `.railway/railway.ts` (Railway infrastructure as code, applied by hand with `railway config apply` because the CLI refuses project tokens for it; `railway.json` is deprecated and ignored by new services). Code shared by front end and server (for example `sanitizePiece`) goes in `src/shared`; the server is bundled with esbuild so it can import it. TypeScript stays on 6.0.x until typescript-eslint supports 7. How the pipeline works, how to release and the one-off dashboard setup are in [docs/deployment.md](docs/deployment.md). 

**Port (task 2).** The prototype now runs as modules with the same behaviour and look. Shared by front end and server, in `src/shared`: `vocabulary` (instruments, keys, scales), `piece` (types, starter, `sanitizePiece`, with the mini-notation check injected so it stays free of Strudel), `compiler` (`layerCalls`, `codeFor`) and `prompt` (`buildPrompt`). Browser only, in `src/web`: `pattern` (call list to Strudel pattern), `audio` (Strudel start-up, samples, limiter, phone unlock), `worklets` (redirects Strudel's `data:` worklets to files), `weave` (the bar and thread model both renderers share), `flat-cloth`, `tapestry` and `tapestry-shaders`, `cloth` (chooses a renderer, weaving loop), `transport`, `export` (MP3 and Save cloth as normal downloads), `composer` (the AI interface; nothing implements it until task 4, so the page says the AI is not connected yet), `state` and `ui`. Sounds and the iPhone silence clip are in `public/`; `npm install` extracts Strudel's worklets into `public/worklets/` (git-ignored) so they always match the installed Strudel. The font is bundled from `@fontsource-variable/recursive` instead of Google Fonts, so the strict Content Security Policy holds with no third-party requests. three.js moved from r128 to r187: colour management is off and light intensities are scaled by pi so the tapestry looks the same. The CI smoke test loads the page, checks the tapestry draws, plays until a bar is woven, and fails on any console error.

**Tests (task 3).** Vitest unit tests in `src/shared/*.test.ts`: `piece.test.ts` feeds `sanitizePiece` hostile and malformed input and covers the mini-notation whitelist for notes and rhythms; `compiler.test.ts` snapshots the call lists and code listings for example pieces (`__snapshots__/`; update with `npx vitest run -u` only when a change to the sound or listing is intended); `prompt.test.ts` covers `buildPrompt`. Tests check mini-notation with `@strudel/mini` 1.2.6, the parser `@strudel/web` 1.3.0 is built on (a test fails if the two drift). `@strudel/web` cannot load in Node, and `@strudel/core` depends on `@kabelsalat/web`, which publishes its ES module only through the `module` field that Node ignores; Vitest inlines those packages (`vitest.config.ts`), and the server will need the same care in task 4 (esbuild reads `module`, plain Node and `tsx` do not). Type checking of tests runs under `tsconfig.server.json`.

**AI, phase 1 (task 4).** `POST /api/compose` in `src/server/compose.ts`: checks the `x-invite-code` header against `INVITE_CODE` (timing-safe), validates the body (request up to 500 characters, piece through `sanitizePiece`, history of `{who, text, err}`), applies `Limiter` (10 a minute and 100 a day per visitor by `x-forwarded-for`, 1,000 a day per environment, in memory), then calls Claude: model from `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `max_tokens` 8000, effort `low`, the fixed `INSTRUCTIONS` as a cached system prompt and `buildRequest()` as the user message, structured output against `COMPOSE_SCHEMA` (`src/shared/compose-schema.ts`), and server-side refusal fallbacks (`fallbacks: "default"`) on models that support them. The reply's piece goes through `sanitizePiece` again before it is returned. Errors come back as `{error: code}` (`unavailable`, `forbidden`, `bad_request`, `rate_limited`, `busy`, `refused`, `invalid_json`, `failed`), and the browser's `ServerComposer` maps them to plain-words messages. `GET /api/status` says whether the AI is on (a key and an invite code are both set). Logs carry status, timing and token usage only. The browser asks for the invite code once and keeps it in `localStorage` (`gl.invite`). The server bundle includes its dependencies (esbuild, `mainFields: ['module', 'main']`) so `@strudel/mini` loads; `npm run dev` rebuilds it in watch mode and reads `.env`. Unit tests use a fake Claude (`src/server/compose.test.ts`); `e2e/ai.spec.ts` stubs the endpoints in the browser. Nothing in CI calls the real API.

**Controls added after the port.** Overall volume (a gain node after the limiter, so it changes what is heard but not the MP3; squared for a useful slider range; remembered per device in `localStorage` as `gl.volume`, not part of the piece). Start over stops playback and clears the piece, the cloth and the chat; Undo still restores the piece. Clear chat empties the conversation (which is also the AI's context) and keeps the piece. The invite code field shows what is typed.

**Prototype.** `prototype/index.html` is a working single-file prototype (about 1,240 lines), originally a claude.ai artifact. It is the reference implementation: behaviour, look and copy are all agreed. Do not treat it as throwaway; port it.

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
8. **The tapestry encodes the music.** Each bar is a band, newest at the weaving edge near the bottom of the view, older bars pushed away into the distance. Each layer is a row two yarns deep. The notes carry the colour: full colour and raised (with soft shadows) where the layer sounds, a faint tint of its colour between notes so the row can be found, almost undyed when the layer is muted, paler for higher notes. The first pick of each bar is a shade darker, a bar line. Labels such as "+ Trumpet" mark the bar where a change happened.
9. **Phones need audio started inside the tap.** `unlockAudio()` runs synchronously in the click handler, and a looping near-silent media element stops iPhones muting Web Audio when the ringer switch is on silent. Without both, the shuttle moves but nothing is heard.

## Claude.ai artifact workarounds to remove in the port

These exist only because the prototype ran inside the claude.ai artifact sandbox:

- **AI calls** go through `claude.use("sample")`. Replace with the composer described under "Hosting, deployment and AI keys" below.
- **Saving files** goes through `claude.use("downloads")`, and the MP3 is wrapped in a zip because that capability would not accept `.mp3`. Replace with a normal download of the `.mp3` directly.
- **Audio worklet redirect.** Strudel embeds its worklets as `data:` URLs, which the artifact security policy blocked, so a shim rewrites them to the extracted files next to the page. In a normal app, either drop the shim or keep the files and set a policy that allows them.
- **Libraries from CDNs** (`@strudel/web` 1.3.0, three r128, lamejs 1.2.1) were loaded as UMD scripts because the artifact could not bundle. Use npm packages and ES modules instead; current three.js no longer ships UMD builds.
- **Browser storage** holds the current piece and chat for one viewer only. Fine to keep for drafts; share links (below) replace it for sharing.

## Known gaps

- Save cloth still exports the flat 2D style, not the tapestry.
- The tapestry rebuilds the whole data texture every frame while playing. Fine on desktop; may stutter on older phones. Only the live bar changes, so incremental updates are an easy win.
- MP3 recording uses `ScriptProcessorNode`, which is deprecated. Move to an AudioWorklet recorder.
- No share links yet. The plan was a URL that encodes the piece JSON (compressed), so links carry data, never code.
- Notes far outside an instrument's sampled range are repitched heavily and can sound odd.
- The AI prompt has had little tuning against real requests.

## Hosting, deployment and AI keys

Decided:

- **Hosting: Railway**, one service to start: a small Node server (for example Hono) that serves the built front end, `/api/compose` and `/healthz`. Build, start, health check and branch trigger settings live in code (`.railway/railway.ts`, applied with the Railway CLI), not only in the dashboard.
- **CI/CD: GitHub Actions for checks, Railway for deploys.**
  - CI runs on every pull request and on every push to `main`: install, lint, typecheck, unit tests, build, and a headless browser smoke test (page loads, plays, tapestry draws, no console errors).
  - **Staging** autodeploys from `main` with Railway's **Wait for CI** setting on, so a commit deploys only after every workflow on it passes; a failed run leaves the previous version running.
  - **Production** deploys from a version tag (`v*`) through a GitHub Actions workflow that runs `railway up --ci --service <service>` with a production-scoped Railway project token (the token picks the environment; passing `--environment` with a project token fails as unauthorised) in `RAILWAY_TOKEN`, behind a GitHub environment that needs approval.
  - **PR environments** are on for previews. They copy the base environment's variables, including the API key, so the spend guardrails below apply to them too.
- **AI keys: two phases behind one interface.** The front end calls a `Composer` with `compose({request, piece, history}) → {reply, piece}`. Whatever implements it, the result passes through `sanitizePiece` before use.
  - **Phase 1, prototype and testing: server-held key.** The project owner pays. `ServerComposer` posts to `/api/compose`; the server holds `ANTHROPIC_API_KEY` as a Railway variable (a separate key per environment), asks Claude for the `{reply, piece}` JSON through a JSON schema, validates it, and returns it. Guardrails, because the URL is public and the key is not: an access gate during testing (an invite code is enough), per-client rate limits, a cap on output tokens, and a spend limit set on each key in the Anthropic Console. Never log request bodies with keys or personal data.
  - **Phase 2, production: bring your own key and model.** A settings panel takes provider, model and key. The key stays in the browser (this session by default, "remember on this device" as an opt-in) and requests go straight from the browser to the provider, so the server never holds anyone's key. Anthropic allows this with the `anthropic-dangerous-direct-browser-access` header; a provider that blocks browser requests needs a stateless pass-through on the server that never stores or logs keys. Each provider is a small adapter behind `Composer`. Models differ in how reliably they follow the schema, so a small eval set of requests checks that a model's output passes `sanitizePiece` and sounds sensible before it is offered in the list. Keys in the browser make a strict Content Security Policy essential: no third-party scripts at runtime, no inline script.
  - Phase 1 stays available as a server mode for forks that self-host.

## First tasks (suggested order, tracer bullet first)

1. **Pipeline first.** A skeleton Vite + TypeScript front end and Node server, deployed through the full path: CI on a pull request, staging deploy after merge with Wait for CI, production deploy from a tag. Prove the pipe end to end before porting anything.
2. **Port** the prototype into modules with no change in behaviour: `vocabulary`, `piece` (types and `sanitizePiece`), `compiler`, `audio`, `composer`, `tapestry`, `flat-cloth`, `export`, `ui`. Keep `prototype/` as the reference until the port matches it.
3. **Tests** where a bug would hurt most: `sanitizePiece` against hostile and malformed input, the mini-notation whitelist, and `compiler` (piece in, call list and code listing out, as snapshots). Add the smoke test to CI.
4. **Phase 1 AI**: the `Composer` interface, `ServerComposer`, `/api/compose` with the guardrails above.
5. **Share links**: piece JSON compressed into the URL.
6. **Tapestry**: incremental texture updates, ES-module three.js, Save cloth rendered from the tapestry itself.
7. **Export**: AudioWorklet recorder, direct MP3 download, optional WAV.
8. **Phase 2 AI**: settings panel, browser-side provider adapters, model eval set.

## Conventions

- UI copy and docs use Australian English.
- No em dashes in UI copy or docs.
- Docs use role-based phrasing ("the request is validated against the whitelist") rather than personal pronouns.
- UI copy names things the way a non-musician would recognise them; any music term is explained in the same breath.
- Keep the sample credits visible in the UI.
