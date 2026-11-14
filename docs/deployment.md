# Deployment

Groove Loom runs as one Railway service: a small Node server (Hono) that serves the built front end and `/healthz`, and later `/api/compose`. GitHub Actions runs the checks; Railway builds and runs the app.

## The pipeline

| Event | What runs | Result |
|---|---|---|
| Pull request opened or updated | `CI` workflow: lint, typecheck, unit tests, build, browser smoke test | Pass or fail shown on the pull request. Railway also builds a PR environment for previews. |
| Merge to `main` | `CI` workflow on the merge commit | Railway deploys to **staging** only after every workflow on that commit passes (Wait for CI). A failed run leaves the previous version running. |
| Push of a `v*` tag | `Deploy production` workflow | Checks the tag, reruns `CI`, waits for approval, deploys to **production** with `railway up`, then waits until `/healthz` reports the new version. |

Build, start and health check settings live in [`railway.json`](../railway.json) and apply to every environment. A deploy whose health check fails never replaces the running version.

## Releasing

1. Make sure `main` is green and staging looks right.
2. On an up-to-date `main`, bump the version and push the tag:

   ```sh
   npm version patch     # or minor / major; commits and tags vX.Y.Z
   git push --follow-tags
   ```

   The version bump goes straight to `main`, so it is the one commit that skips a pull request. If the branch ruleset blocks direct pushes, bump the version in a pull request instead, then tag the merge commit with `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. In GitHub, open **Actions → Deploy production** and approve the `production` deployment when it asks.
4. The workflow finishes once production reports the new version at `/healthz`.

The workflow refuses a tag that points at a commit not on `main`, or that does not match the version in `package.json`.

## Rolling back

In Railway, open the service in the `production` environment, find the last good deployment and choose **Redeploy**. This is immediate and needs no new tag. Follow up with a fix and a new release.

## One-off setup

These steps are done once, in the Railway and GitHub dashboards. They cannot live in the repo.

### Railway

1. Create a project from the GitHub repo, installing the Railway GitHub app with access to `groove-loom`. This creates one service and an environment called `production`.
2. Add an environment called `staging` (duplicate `production`).
3. In `staging`, open the service's **Settings → Source**: set the branch to `main` and turn on **Wait for CI**. Generate a public domain.
4. In `production`, open the service's **Settings → Source** and **disconnect the branch trigger**. Production must only change through the tag workflow; without this step every merge to `main` would also deploy to production. Generate a public domain.
5. In **Project Settings → Environments**, turn on PR environments and set the base environment to `staging`. PR environments copy the base environment's variables, so previews get staging's API key, never production's.
6. In **Project Settings → Tokens**, create a project token scoped to the `production` environment. It is used by GitHub below.
7. No variables are needed yet; Railway sets `PORT`. `ANTHROPIC_API_KEY` arrives with the composer, as a separate key per environment, each with a spend limit in the Anthropic Console.

### GitHub

The repository must be public (or on GitHub Enterprise) for required reviewers on environments.

1. **Settings → Environments → New environment** named `production`:
   - Required reviewers: the project owner. Leave **Prevent self-review** off so the owner can approve their own releases.
   - Deployment branches and tags: **Selected branches and tags**, add a tag rule for `v*`.
   - Environment secret `RAILWAY_TOKEN`: the project token from Railway step 6.
   - Environment variable `RAILWAY_SERVICE`: the service name shown in Railway.
   - Environment variable `PRODUCTION_URL`: the production domain with `https://` and no trailing slash, for example `https://groove-loom-production.up.railway.app`.
2. **Settings → Rules → Rulesets → New branch ruleset** targeting `main`:
   - Require a pull request before merging.
   - Require status checks to pass: `check` and `smoke` (they can be picked once CI has run at least once).
   - Block force pushes.
   - Add the repository admin to the bypass list if version bumps are pushed straight to `main` (see Releasing).
3. Optional: a tag ruleset on `v*` restricting who can create release tags.

### After the first deploys

Railway only applies `railway.json` once it has deployed a commit that contains it. After the first staging deploy (and, for production, the first release), open the service's **Settings** in that environment and check that the build command, start command, health check and restart policy show as set by the config file.

## Local development

```sh
npm install
npm run dev          # Vite on http://localhost:5173, server on 8787 behind it
npm run build && npm start   # production build on http://localhost:8787
```

Checks, as CI runs them:

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium   # first time only
npm run build && npm run test:smoke
```
