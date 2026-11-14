# Security

## Reporting a problem

Report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Public issues are visible to everyone, so please do not use them for security problems.

A useful report says what the problem is, how to reproduce it and what it could lead to. Reports are acknowledged within a week.

Only the latest release, running at the production URL, is supported. Forks are run by their own owners.

## What is in scope

- The server: `/api/compose`, `/api/status`, `/healthz` and static file serving.
- Anything that could spend the project's AI credit without the invite code, get round the request limits or the invite code lockout, or reveal the API key.
- Anything that lets a piece (from the AI, browser storage or, later, a share link) run code or inject markup in the page.

Problems in Strudel, three.js or other dependencies belong with those projects, unless Groove Loom uses them in an unsafe way.

## How the app is protected

- **The AI returns data, never code.** Every reply is checked against a JSON schema, then every field passes through `sanitizePiece`: instruments, keys and scales come from fixed lists, numbers are clamped, and notes and rhythms must match strict character patterns and parse as Strudel mini-notation. The browser checks the piece again before using it.
- **The API key stays on the server** as a hosting variable, and each environment has its own key with a spend limit set in the Anthropic Console.
- **Access and limits.** An invite code unlocks the AI, compared in constant time. A visitor gets 5 wrong codes a minute and 20 a day, after which they are refused, even with the right code, until the limit resets. Each visitor gets 10 requests a minute and 100 a day, and each environment 1,000 a day. Request bodies are capped at 32 KB, requests at 500 characters, and replies at 8,000 output tokens.
- **A strict Content Security Policy**: scripts, styles and connections from the app's own origin only, no inline script, and the page cannot be framed.
- **Logs** record status, timing and token counts only, never what people typed, their pieces or the AI's replies.
- **Dependencies** are updated through Dependabot, and CI fails on a known high or critical vulnerability in production dependencies.

Tests cover each of these: `src/shared/piece.test.ts` (hostile and malformed pieces), `src/server/compose.test.ts` (access, lockout, limits, logging) and `src/server/app.test.ts` (security headers).

## Known limits

- Limits are counted in memory, so they reset when the server restarts and are not shared between instances. The spend limit on each API key is the hard cap.
- One invite code is shared by all testers, so it cannot be withdrawn from one person without changing it for everyone. Changing it means updating `INVITE_CODE` in the hosting settings.
