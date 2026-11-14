# Contributing

Thanks for helping. This guide covers how a change gets in and the few rules that keep the project coherent. Setup and commands are in the [README](README.md).

## Making a change

1. Branch from `main`. Keep a pull request to one idea.
2. Run the checks before pushing:
   ```sh
   npm run lint && npm run typecheck && npm test
   npm run build && npm run test:smoke
   ```
3. Open a pull request saying what changed and why, and how it was checked (a recording, a screenshot, a test). CI runs the same checks, and Railway builds a preview environment for each pull request.
4. A pull request can merge once the `check` and `smoke` checks pass. A merge deploys to staging; production releases are tagged separately (see [docs/deployment.md](docs/deployment.md)).

Dependabot opens dependency updates weekly. Minor and patch updates can merge once CI passes; major updates need a look at the changelog first.

## Rules that hold the design together

These come from [docs/design-decisions.md](docs/design-decisions.md), which has the reasoning.

- **The AI returns data, never code.** Anything from the AI, browser storage or a link passes through `sanitizePiece` before use. A new piece field needs a whitelist or clamp there, a schema entry in `compose-schema.ts` and tests in `piece.test.ts`.
- **One source of truth for sound and code.** `layerCalls()` in `src/shared/compiler.ts` drives both the audio and the code panel. Do not build sound anywhere else.
- **Text goes in as text.** Set `textContent`, never `innerHTML`, with anything that came from the AI or a person.
- **No third-party requests at runtime.** Scripts, styles, fonts and samples are bundled or served from the app's own origin, so the strict Content Security Policy holds.
- **Never log what people type**, their pieces or the AI's replies. Logs carry status, timing and token counts.

## Tests

- Unit tests sit beside the code (`*.test.ts`); browser tests are in `e2e/`.
- No test calls the real AI. Server tests use a fake Claude (`src/server/compose.test.ts`), and browser tests stub the endpoints.
- `src/shared/__snapshots__/` holds the expected Strudel calls for example pieces. Update them with `npx vitest run -u` only when a change to the sound or the code listing is intended, and say so in the pull request.
- Security changes come with a test that tries the attack.

## Writing

UI copy and docs follow the same style:

- Australian English (colour, organise).
- No em dashes.
- Plain words a non-musician would recognise. A music term is explained in the same breath ("swing: every second note lands a little late").
- Docs use role-based phrasing ("the request is checked against the whitelist") rather than "I" or "we".

## Samples and credits

New samples need a licence that allows redistribution, and an entry in [CREDITS.md](CREDITS.md). Keep the credits visible in the UI.

## Security problems

Do not open a public issue. See [SECURITY.md](SECURITY.md).
