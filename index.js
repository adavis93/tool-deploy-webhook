'use strict';

const express = require('express');
const https = require('https');
const serverless = require('serverless-http');

const app = express();

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ---------------------------------------------------------------------------
// Netlify build hook trigger
// ---------------------------------------------------------------------------

function triggerHook(hookUrl) {
  return new Promise((resolve, reject) => {
    const req = https.request(hookUrl, { method: 'POST' }, (res) => {
      res.resume(); // drain the response so the socket is released
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Deploy handler factory
// ---------------------------------------------------------------------------

function makeDeployHandler(environment) {
  return async (req, res) => {
    const { project } = req.query;

    if (!project) {
      return res.status(400).json({ error: 'Missing required query parameter: project' });
    }

    // Env var pattern: NETLIFY_HOOK_<PROJECT>_<ENVIRONMENT>
    // e.g. NETLIFY_HOOK_MY_APP_STAGING
    const envKey = `NETLIFY_HOOK_${project.toUpperCase().replace(/-/g, '_')}_${environment}`;
    const hookUrl = process.env[envKey];

    if (!hookUrl) {
      return res.status(404).json({
        error: `No build hook configured for project "${project}" in ${environment.toLowerCase()}`,
        hint: `Set the ${envKey} environment variable`,
      });
    }

    try {
      const hookStatus = await triggerHook(hookUrl);
      res.json({ ok: true, project, environment: environment.toLowerCase(), hookStatus });
    } catch (err) {
      res.status(502).json({ error: 'Failed to trigger build hook', details: err.message });
    }
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.post('/deploy/staging', requireApiKey, makeDeployHandler('STAGING'));
app.post('/deploy/production', requireApiKey, makeDeployHandler('PRODUCTION'));

// ---------------------------------------------------------------------------
// Local dev server
// ---------------------------------------------------------------------------

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
}

// ---------------------------------------------------------------------------
// Netlify serverless export
// ---------------------------------------------------------------------------

module.exports.handler = serverless(app);
