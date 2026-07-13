'use strict';

const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join, relative, resolve } = require('node:path');
const test = require('node:test');
const { ESLint } = require('eslint');

const SRC = resolve(__dirname, '../../src');
const MODULES = resolve(SRC, 'modules');

function filesBelow(directory, suffix) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(path, suffix);
    return entry.name.endsWith(suffix) ? [path] : [];
  });
}

function source(path) {
  return readFileSync(path, 'utf8');
}

test('persistence repositories depend on domain plans, never HTTP or business-policy code', () => {
  for (const path of filesBelow(MODULES, '.repository.ts')) {
    const label = relative(SRC, path);
    const contents = source(path);
    assert.doesNotMatch(contents, /\bAppErrors\b/, `${label} must not translate HTTP errors`);
    assert.doesNotMatch(
      contents,
      /\bdecodeCursor(?:Id)?\b/,
      `${label} must receive parsed cursor values`,
    );
    assert.doesNotMatch(
      contents,
      /from ['"][^'"]*\.policy['"];/,
      `${label} must execute an explicit domain plan, not own/import policy`,
    );
  }
});

test('application services do not construct Prisma inputs', () => {
  for (const path of filesBelow(MODULES, '.service.ts')) {
    const label = relative(SRC, path);
    const contents = source(path);
    assert.doesNotMatch(contents, /from ['"]@linkedout\/db['"]/, `${label} must not import Prisma`);
    assert.doesNotMatch(contents, /\bPrisma\./, `${label} must use domain-shaped data`);
  }
});

test('feature modules expose application services, never persistence repositories', () => {
  for (const path of filesBelow(MODULES, '.module.ts')) {
    const label = relative(SRC, path);
    const contents = source(path);
    assert.doesNotMatch(
      contents,
      /exports\s*:\s*\[[^\]]*Repository/,
      `${label} must not export a repository across feature seams`,
    );
  }

  for (const path of filesBelow(MODULES, '.ts')) {
    const label = relative(SRC, path);
    const contents = source(path);
    assert.doesNotMatch(
      contents,
      /from ['"]\.\.\/[^'"]+\/[^'"]*\.repository['"];/,
      `${label} must collaborate through another feature's application interface`,
    );
  }
});

test('ESLint rejects critical persistence-boundary imports before the regex audit runs', async () => {
  const eslint = new ESLint({ cwd: resolve(__dirname, '../../../..') });
  const cases = [
    {
      filePath: 'apps/api/src/modules/example/example.repository.ts',
      code: "import { points } from '../ls/popularity.policy';\nvoid points;\n",
    },
    {
      filePath: 'apps/api/src/modules/example/example.repository.ts',
      code: "import { decodeCursor } from '../../common/pagination/cursor';\nvoid decodeCursor;\n",
    },
    {
      filePath: 'apps/api/src/modules/example/example.service.ts',
      code: "import { Prisma } from '@linkedout/db';\nvoid Prisma;\n",
    },
    {
      filePath: 'apps/api/src/modules/example/example.service.ts',
      code: "import { UsersRepository } from '../users/users.repository';\nvoid UsersRepository;\n",
    },
    {
      filePath: 'apps/api/src/modules/example/example.module.ts',
      code: 'class BadRepository {}\nconst moduleMetadata = { exports: [BadRepository] };\nvoid moduleMetadata;\n',
    },
  ];

  for (const fixture of cases) {
    const [result] = await eslint.lintText(fixture.code, { filePath: fixture.filePath });
    assert.ok(
      result.messages.some((message) =>
        ['no-restricted-imports', 'no-restricted-syntax'].includes(message.ruleId),
      ),
      `${fixture.filePath} must be rejected by an ESLint architecture rule: ${JSON.stringify(result.messages)}`,
    );
  }
});
