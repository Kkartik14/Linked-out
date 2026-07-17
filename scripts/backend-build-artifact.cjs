#!/usr/bin/env node
'use strict';

const { cp, readFile, readdir, rm, stat } = require('node:fs/promises');
const { isAbsolute, join, parse, relative, resolve, sep } = require('node:path');

const REPOSITORY_ROOT = resolve(__dirname, '..');
const PACKAGES_ROOT = join(REPOSITORY_ROOT, 'packages');

function usage() {
  return 'Usage: node scripts/backend-build-artifact.cjs <stage|verify> <absolute-artifact-directory>';
}

function isWithin(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent !== '' && !pathFromParent.startsWith(`..${sep}`) && pathFromParent !== '..';
}

function assertSafeStageDirectory(artifactRoot) {
  if (
    artifactRoot === parse(artifactRoot).root ||
    artifactRoot === REPOSITORY_ROOT ||
    isWithin(artifactRoot, REPOSITORY_ROOT) ||
    isWithin(REPOSITORY_ROOT, artifactRoot)
  ) {
    throw new Error('The staged artifact directory must be outside the repository and filesystem root.');
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function sharedPackageOutputs() {
  const packageDirectories = (await readdir(PACKAGES_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const outputs = [];

  for (const directoryName of packageDirectories) {
    const packageDirectory = join(PACKAGES_ROOT, directoryName);
    const manifestPath = join(packageDirectory, 'package.json');
    if (!(await exists(manifestPath))) continue;

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const runtimeEntrypoints = [manifest.main, manifest.types].filter(
      (entrypoint) => typeof entrypoint === 'string',
    );
    if (runtimeEntrypoints.length === 0) continue;

    for (const entrypoint of runtimeEntrypoints) {
      const entrypointPath = resolve(packageDirectory, entrypoint);
      if (!isWithin(packageDirectory, entrypointPath)) {
        throw new Error(`${manifest.name ?? directoryName} has an entrypoint outside its package.`);
      }
      if (!entrypoint.split(/[\\/]/u).includes('dist')) {
        throw new Error(`${manifest.name ?? directoryName} has a runtime entrypoint outside dist/.`);
      }
    }

    outputs.push({
      source: join(packageDirectory, 'dist'),
      destination: join('packages', directoryName, 'dist'),
      requiredFiles: runtimeEntrypoints.map((entrypoint) =>
        join('packages', directoryName, entrypoint),
      ),
    });
  }

  return outputs;
}

async function artifactOutputs() {
  return [
    ...(await sharedPackageOutputs()),
    {
      source: join(REPOSITORY_ROOT, 'packages', 'db', 'generated'),
      destination: join('packages', 'db', 'generated'),
      requiredFiles: [join('packages', 'db', 'generated', 'client', 'index.js')],
    },
    {
      source: join(REPOSITORY_ROOT, 'apps', 'api', 'dist'),
      destination: join('apps', 'api', 'dist'),
      requiredFiles: [join('apps', 'api', 'dist', 'main.js')],
    },
  ];
}

async function verify(artifactRoot, outputs) {
  const missing = [];
  for (const output of outputs) {
    for (const requiredFile of output.requiredFiles) {
      if (!(await exists(join(artifactRoot, requiredFile)))) missing.push(requiredFile);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Backend build artifact is incomplete:\n- ${missing.join('\n- ')}`);
  }
}

async function stage(artifactRoot, outputs) {
  assertSafeStageDirectory(artifactRoot);
  await rm(artifactRoot, { recursive: true, force: true });

  for (const output of outputs) {
    if (!(await exists(output.source))) {
      throw new Error(`Build output is missing: ${relative(REPOSITORY_ROOT, output.source)}`);
    }
    await cp(output.source, join(artifactRoot, output.destination), { recursive: true });
  }

  await verify(artifactRoot, outputs);
  console.log(`backend-build artifact staged and verified at ${artifactRoot}`);
}

async function main() {
  const [mode, artifactDirectory] = process.argv.slice(2);
  if (!['stage', 'verify'].includes(mode) || !artifactDirectory || !isAbsolute(artifactDirectory)) {
    throw new Error(usage());
  }

  const artifactRoot = resolve(artifactDirectory);
  const outputs = await artifactOutputs();
  if (mode === 'stage') await stage(artifactRoot, outputs);
  else {
    await verify(artifactRoot, outputs);
    console.log(`backend-build artifact verified at ${artifactRoot}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
