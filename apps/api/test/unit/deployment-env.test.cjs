'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { deploymentEnvironment } = require('../../dist/config/deployment-env');

const relatedWeb = [
  {
    project: { id: 'prj_web', name: 'linked-out-fe' },
    production: { alias: 'linked-out-fe.vercel.app' },
    preview: { branch: 'linked-out-fe-git-feature-team.vercel.app' },
  },
];

test('a Vercel preview uses its own branch API origin and the related web branch origin', () => {
  const resolved = deploymentEnvironment(
    {
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'linked-out-api-git-feature-team.vercel.app',
      API_BASE_URL: 'https://linked-out-api.vercel.app',
      WEB_URL: 'https://linked-out-fe.vercel.app',
      PUBLIC_OAUTH_CALLBACK_BASE_URL: 'https://linked-out-fe.vercel.app',
      OAUTH_SESSION_MODE: 'handoff',
    },
    relatedWeb,
  );

  assert.equal(
    resolved.API_BASE_URL,
    'https://linked-out-api-git-feature-team.vercel.app',
  );
  assert.equal(resolved.WEB_URL, 'https://linked-out-fe-git-feature-team.vercel.app');
  assert.equal(
    resolved.PUBLIC_OAUTH_CALLBACK_BASE_URL,
    'https://linked-out-fe-git-feature-team.vercel.app',
  );
});

test('a custom preview environment alias wins over the ordinary branch alias', () => {
  const resolved = deploymentEnvironment(
    {
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'api-commit.vercel.app',
      WEB_URL: 'https://fallback.example',
      OAUTH_SESSION_MODE: 'handoff',
    },
    [
      {
        ...relatedWeb[0],
        preview: {
          branch: 'web-branch.vercel.app',
          customEnvironment: 'web-staging.example.com',
        },
      },
    ],
  );

  assert.equal(resolved.API_BASE_URL, 'https://api-commit.vercel.app');
  assert.equal(resolved.WEB_URL, 'https://web-staging.example.com');
});

test('local and production environments retain their explicit origins', () => {
  for (const vercelEnv of [undefined, 'production']) {
    const source = {
      VERCEL_ENV: vercelEnv,
      API_BASE_URL: 'https://api.explicit.example',
      WEB_URL: 'https://web.explicit.example',
      PUBLIC_OAUTH_CALLBACK_BASE_URL: 'https://web.explicit.example',
    };
    assert.equal(deploymentEnvironment(source, relatedWeb), source);
  }
});

test('a preview without related-project data fails back to explicit web configuration', () => {
  const resolved = deploymentEnvironment(
    {
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'api-preview.vercel.app',
      WEB_URL: 'https://web-fallback.example',
      PUBLIC_OAUTH_CALLBACK_BASE_URL: 'https://web-fallback.example',
      OAUTH_SESSION_MODE: 'handoff',
    },
    [],
  );

  assert.equal(resolved.API_BASE_URL, 'https://api-preview.vercel.app');
  assert.equal(resolved.WEB_URL, 'https://web-fallback.example');
  assert.equal(resolved.PUBLIC_OAUTH_CALLBACK_BASE_URL, 'https://web-fallback.example');
});
