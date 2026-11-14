// Railway infrastructure as code for Groove Loom.
//
// This file replaces railway.json. It is not read at deploy time: CI applies
// it with `railway config apply` (staging on merge to main, production in the
// release workflow), and `railway config plan` previews a change on a pull
// request. See docs/deployment.md.
//
// One file covers both environments. `ctx.environment` is the environment the
// CLI is applying to.
import { defineRailway, github, project, service } from 'railway/iac';

// This repository owns only the resources declared here, so applying never
// deletes anything else in the Railway project.
export const partial = 'groove-loom';

const repo = 'sara-selvaraju/groove-loom';

export default defineRailway((ctx) => {
  const production = ctx.isEnvironment('production');

  const app = service('groove-loom', {
    // Staging follows main and waits for every GitHub Actions workflow on a
    // commit to pass before deploying (Railway's "Wait for CI").
    // Production has no branch trigger: it only changes when the release
    // workflow runs `railway up` after approval.
    source: production ? undefined : github(repo, { branch: 'main', checkSuites: true }),
    build: { builder: 'RAILPACK', buildCommand: 'npm run build' },
    start: 'npm start',
    // A deploy only goes live once /healthz answers, so a broken build never
    // replaces the running version.
    healthcheck: '/healthz',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 3 },
    replicas: { 'us-west2': 1 },
  });

  return project('sweet-charisma', {
    // Variables (such as ANTHROPIC_API_KEY) are set in the Railway dashboard,
    // never in this file.
    variables: { managed: false },
    resources: [app],
  });
});
