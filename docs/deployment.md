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

These steps are done once, in the Railway and GitHub dashboards. They cannot live in the repo. Do them in order: the Railway part produces values that the GitHub part needs.

### Before starting

- A Railway account, signed in with GitHub.
- The GitHub repository set to **public**. Required reviewers on a GitHub environment, which gate production, are not available for private repositories outside GitHub Enterprise.
- The pipeline pull request open but **not merged**. Merging deploys to staging, so production must be disconnected from `main` first (Railway step 3).

### Railway

#### 1. Create the project

1. In Railway, choose **New Project → Deploy from GitHub repo**.
2. If `groove-loom` is not listed, choose **Configure GitHub App** and give the Railway app access to the repository, then pick it.
3. Railway creates a project with one service (named after the repository, for example `groove-loom`) in an environment called `production`, and immediately tries to deploy `main`.

**Expect that first deploy to fail** with "Railpack failed to prepare the build". Until the pipeline pull request is merged, `main` has no `package.json`, so there is nothing to build. Leave it; do not retry it.

**Note down:** the service name, shown at the top of the service panel. GitHub needs it as `RAILWAY_SERVICE`.

#### 2. Add a staging environment

1. Open the environment menu at the top of the project page (it shows `production`).
2. Choose **New Environment**, name it `staging`, and choose **Duplicate Environment** from `production`. This copies the service and its settings.
3. Switch the environment menu to `staging`. Every remaining step in this subsection is done in `staging`.
4. Click the service, then open **Settings**.
5. Under **Source**, check the connected repository is `groove-loom` and the connected branch is `main`.
6. Under the branch, turn on **Wait for CI**. Railway then holds each deploy until every GitHub Actions workflow on that commit has passed. If the option is missing, it is because `main` has no workflows yet; it appears once the pipeline pull request is merged, so come back and turn it on then.
7. Under **Networking → Public Networking**, choose **Generate Domain**. If asked for a port, enter `8080` (Railway passes the app its port in `PORT`, usually 8080).

**Check:** the staging service shows a `.up.railway.app` address under Networking. Opening it shows a Railway error page until the first staging deploy; that is expected.

**Note down:** the staging address.

#### 3. Disconnect production from `main`

1. Switch the environment menu to `production`.
2. Click the service, then open **Settings**.
3. Under **Source**, find the branch connected to `production` and choose **Disconnect** for the branch. Keep the repository connection itself.
4. Under **Networking → Public Networking**, choose **Generate Domain**, with port `8080` if asked.

Production now only changes when the tag workflow runs `railway up`. Without this step, every merge to `main` would deploy to production as well as staging.

**Check:** **Settings → Source** in `production` no longer shows a branch that triggers deploys, while `staging` still shows `main`.

**Note down:** the production address.

#### 4. Turn on PR environments

1. Open **Project Settings** (the cog at the top of the project page) and go to **Environments**.
2. Turn on **PR Environments**.
3. Set the **base environment** to `staging`.
4. Leave PR environments for bot pull requests (such as Dependabot) off.

PR environments copy the base environment's variables. With `staging` as the base, previews get staging's API key, never production's.

**Check:** the next push to an open pull request creates a temporary environment for it in the environment menu, and Railway deletes it when the pull request closes.

#### 5. Create the production deploy token

1. In **Project Settings**, go to **Tokens**.
2. Create a token named `github-actions-production`, with the environment set to `production`.
3. Copy the token straight away; Railway shows it once.

This token can deploy to `production` and nothing else. It goes into GitHub as an environment secret, so a workflow can only read it after a release has been approved.

**Note down:** the token, somewhere temporary (it is pasted into GitHub next and should not be kept anywhere else).

#### 6. Variables

None are needed yet: Railway sets `PORT` itself. `ANTHROPIC_API_KEY` arrives with the composer, as a separate key per environment (`staging` and `production`), each with a spend limit in the Anthropic Console.

### Values for GitHub

| Value | Where it came from | Used as |
|---|---|---|
| Service name, for example `groove-loom` | Railway step 1 | `RAILWAY_SERVICE` variable |
| Production address | Railway step 3 | `PRODUCTION_URL` variable, written as `https://<address>` with no trailing slash |
| Production token | Railway step 5 | `RAILWAY_TOKEN` secret |
| Staging address | Railway step 2 | Not needed by GitHub; used to check staging after merging |

### GitHub

#### 1. Create the production environment

1. In the repository, open **Settings → Environments → New environment** and name it `production` (it must match the name in the workflow).

   Entries such as `sweet-charisma / staging` may already be listed. Railway's GitHub app creates these to record its own deploys, named after the Railway project. They are not used by the workflow: leave them alone and create a separate environment named exactly `production`. Renaming the Railway project (**Project Settings → General**) makes its entries easier to tell apart.

2. Tick **Required reviewers** and add the project owner. Leave **Prevent self-review** off, so the owner can approve their own releases. Save the protection rules.
3. Under **Deployment branches and tags**, choose **Selected branches and tags**, then **Add deployment branch or tag rule**, pick **Tag**, and enter `v*`.
4. Under **Environment secrets**, add `RAILWAY_TOKEN` with the token from Railway step 5. Then delete the temporary copy.
5. Under **Environment variables**, add `RAILWAY_SERVICE` (the service name) and `PRODUCTION_URL` (for example `https://groove-loom-production.up.railway.app`).

#### 2. Protect `main`

1. Open **Settings → Rules → Rulesets → New ruleset → New branch ruleset**.
2. Name it `main`, set **Enforcement status** to Active, and under **Target branches** add the default branch.
3. Tick **Require a pull request before merging**.
4. Tick **Require status checks to pass**, then add `check` and `smoke`. They can only be picked once CI has run at least once, which the pipeline pull request has done.
5. Tick **Block force pushes**.
6. Releases push a version bump straight to `main` (see Releasing). To allow that, use the **Bypass list** section near the top of the same page (above **Target branches**): choose **Add bypass**, tick **Repository admin**, choose **Add selected**, then set its mode to **Always allow**. "For pull requests only" would still block the direct push. Without a bypass, make version bumps through pull requests.

#### 3. Optional: protect release tags

A tag ruleset targeting `v*` that restricts creation to admins stops anyone else starting a production release.

## First run

1. **Merge the pipeline pull request.** CI runs on the merge commit, then Railway deploys staging. Watch it under the service's **Deployments** in `staging`.
2. **Check staging.** Open the staging address. The page should say "Server is up: version 0.1.0" followed by a short build code. If **Wait for CI** was missing in Railway step 2, turn it on now.
3. **Check `railway.json` is in use.** Railway only applies the file once it has deployed a commit containing it. In `staging`, open the service's **Settings** and check that the build command, start command, health check and restart policy show as set by the config file.
4. **Release.** On an up-to-date `main`, run `npm version patch && git push --follow-tags`, or tag the current version with `git tag v0.1.0 && git push origin v0.1.0`. Approve the `production` deployment under **Actions → Deploy production**.
5. **Check production.** The workflow ends once production reports the new version. Open the production address to confirm, then repeat check 3 in `production`.

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
