'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

require('reflect-metadata');

const { RequestMethod } = require('@nestjs/common');
const {
  GUARDS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} = require('@nestjs/common/constants');
const { RouteParamtypes } = require('@nestjs/common/enums/route-paramtypes.enum');
const { z } = require('zod');
const {
  feedQuerySchema,
  searchQuerySchema,
  ulidSchema,
  usernameInputSchema,
  PRINCIPAL_BINDING_HEADER,
} = require('@linkedout/contracts');

const { AppModule } = require('../../dist/app.module');
const {
  API_CONTRACT_METADATA,
  API_ROUTE_CONTRACTS,
  API_ROUTE_CONTRACT_BY_KEY,
} = require('../../dist/common/contracts/api-route-contracts');
const { ZodValidationPipe } = require('../../dist/common/pipes/zod-validation.pipe');
const { MetaController } = require('../../dist/modules/meta/meta.controller');
const { MetaService } = require('../../dist/modules/meta/meta.service');

const HTTP_METHODS = new Set(['delete', 'get', 'head', 'options', 'patch', 'post', 'put']);
const KNOWN_GUARDS = new Set([
  'GithubAuthGuard',
  'GoogleAuthGuard',
  'BffCallerGuard',
  'JwtAuthGuard',
  'OptionalAuthGuard',
  'EmailOtpInspectionGuard',
]);
const DIRECT_COOKIE_SECURITY = new Map([
  ['post /auth/refresh', [{ refreshCookie: [] }]],
]);
const STATIC_METADATA_CACHE_CONTROL =
  'public, max-age=86400, stale-while-revalidate=604800';

function normalizePath(path) {
  const normalized = `/${path}`
    .replace(/\/+/g, '/')
    .replace(/:([^/]+)/g, '{$1}')
    .replace(/\/$/, '');
  return normalized || '/';
}

function moduleType(reference) {
  if (typeof reference === 'function') return reference;
  if (reference && typeof reference.forwardRef === 'function') return moduleType(reference.forwardRef());
  if (reference && typeof reference.module === 'function') return reference.module;
  throw new TypeError(`Cannot inspect Nest module reference: ${String(reference)}`);
}

async function registeredControllers(rootModule) {
  const controllers = new Set();
  const visited = new Set();
  const pending = [rootModule];
  while (pending.length > 0) {
    const reference = await pending.pop();
    const Module = moduleType(reference);
    const dynamicControllers = reference && typeof reference === 'object' ? reference.controllers : [];
    for (const Controller of [
      ...(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, Module) ?? []),
      ...(dynamicControllers ?? []),
    ]) {
      controllers.add(Controller);
    }
    if (visited.has(Module)) continue;
    visited.add(Module);
    const dynamicImports = reference && typeof reference === 'object' ? reference.imports : [];
    pending.push(
      ...(Reflect.getMetadata(MODULE_METADATA.IMPORTS, Module) ?? []),
      ...(dynamicImports ?? []),
    );
  }
  return [...controllers];
}

function guardNames(Controller, handler) {
  const guards = [
    ...(Reflect.getMetadata(GUARDS_METADATA, Controller) ?? []),
    ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? []),
  ];
  const names = guards.map((guard) => guard.name ?? guard.constructor?.name);
  for (const name of names) assert.ok(KNOWN_GUARDS.has(name), `classify guard ${name}`);
  return new Set(names);
}

function expectedSecurity(guards) {
  if (guards.has('BffCallerGuard')) return [{ bffCallerAssertion: [] }];
  if (guards.has('EmailOtpInspectionGuard')) return [{ otpInspectionSecret: [] }];
  if (guards.has('JwtAuthGuard')) return [{ accessCookie: [] }];
  if (guards.has('OptionalAuthGuard')) return [{}, { accessCookie: [] }];
  return [];
}

function expectedSuccessStatus(method, handler, guards) {
  if (guards.has('GoogleAuthGuard') || guards.has('GithubAuthGuard')) return 302;
  const explicit = Reflect.getMetadata(HTTP_CODE_METADATA, handler);
  if (explicit !== undefined) return explicit;
  return method === RequestMethod.POST ? 201 : 200;
}

async function controllerOperations() {
  const operations = new Map();
  for (const Controller of await registeredControllers(AppModule)) {
    const controllerPaths = [Reflect.getMetadata(PATH_METADATA, Controller) ?? ''].flat();
    for (const methodName of Object.getOwnPropertyNames(Controller.prototype)) {
      const handler = Controller.prototype[methodName];
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      const handlerMetadata = Reflect.getMetadata(PATH_METADATA, handler);
      if (method === undefined || handlerMetadata === undefined) continue;
      const guards = guardNames(Controller, handler);
      for (const controllerPath of controllerPaths) {
        for (const handlerPath of [handlerMetadata].flat()) {
          const path = normalizePath([controllerPath, handlerPath].filter(Boolean).join('/'));
          const httpMethod = RequestMethod[method].toLowerCase();
          const key = `${httpMethod} ${path}`;
          assert.ok(!operations.has(key), `duplicate registered operation ${key}`);
          operations.set(key, {
            Controller,
            handler,
            key,
            methodName,
            method: httpMethod,
            path,
            guards,
            security: DIRECT_COOKIE_SECURITY.get(key) ?? expectedSecurity(guards),
            status: expectedSuccessStatus(method, handler, guards),
          });
        }
      }
    }
  }
  return operations;
}

function documentedOperations(document) {
  return new Map(
    Object.entries(document.paths).flatMap(([path, pathItem]) =>
      Object.entries(pathItem)
        .filter(([method]) => HTTP_METHODS.has(method))
        .map(([method, operation]) => [`${method} ${normalizePath(path)}`, operation]),
    ),
  );
}

function getParameter(document, path, method, name) {
  const found = document.paths[path][method].parameters?.find((item) => item.name === name);
  assert.ok(found, `${method.toUpperCase()} ${path} documents ${name}`);
  return found;
}

test('one OpenAPI document covers exactly the sole public API', async () => {
  const document = new MetaService().getOpenApi();
  const registered = await controllerOperations();
  assert.deepEqual([...documentedOperations(document).keys()].sort(), [...registered.keys()].sort());
  assert.deepEqual([...API_ROUTE_CONTRACT_BY_KEY.keys()].sort(), [...registered.keys()].sort());
  assert.equal(document.info.version, '1.1.2');
  assert.deepEqual(document.servers, [{ url: '/v1' }]);
  assert.equal(document.paths['/tags/popular'], undefined);
  assert.ok(document.paths['/feed/sidebar']);
  assert.equal(document.paths['/feed'].get.parameters.some((item) => item.name === 'filter'), false);
  assert.equal(document.paths['/search'].get.parameters.some((item) => item.name === 'filter'), false);
});

test('OpenAPI security, success status, route contract, and body pipe match every handler', async () => {
  const document = new MetaService().getOpenApi();
  const documented = documentedOperations(document);
  for (const expected of (await controllerOperations()).values()) {
    const operation = documented.get(expected.key);
    const contract = API_ROUTE_CONTRACT_BY_KEY.get(expected.key);
    assert.ok(operation, `${expected.key} is documented`);
    assert.strictEqual(
      Reflect.getMetadata(API_CONTRACT_METADATA, expected.handler),
      contract,
      `${expected.key} binds its canonical contract`,
    );
    assert.deepEqual(operation.security ?? document.security ?? [], expected.security);
    assert.ok(operation.responses[String(expected.status)]);
    for (const status of ['400', '401', '404', '429', '500']) {
      assert.equal(
        operation.responses[status].content['application/json'].schema.$ref,
        '#/components/schemas/ErrorEnvelope',
        `${expected.key} documents ${status}`,
      );
    }

    const bodyArguments = Object.entries(
      Reflect.getMetadata(ROUTE_ARGS_METADATA, expected.Controller, expected.methodName) ?? {},
    ).filter(([key]) => key.startsWith(`${RouteParamtypes.BODY}:`));
    if (contract.body) {
      assert.equal(bodyArguments.length, 1, `${expected.key} has one body`);
      const pipes = bodyArguments[0][1].pipes.filter((pipe) => pipe instanceof ZodValidationPipe);
      assert.equal(pipes.length, 1, `${expected.key} has one Zod body pipe`);
      assert.strictEqual(pipes[0].contractSchema, contract.body.schema);
    } else {
      assert.equal(bodyArguments.length, 0, `${expected.key} has no undocumented body`);
    }
  }
  assert.equal(new Set(Object.values(API_ROUTE_CONTRACTS)).size, Object.keys(API_ROUTE_CONTRACTS).length);
});

test('every optional-auth read rejects a presented invalid credential', async () => {
  const optionalReads = [...(await controllerOperations()).values()].filter(
    ({ guards }) => guards.has('OptionalAuthGuard'),
  );
  assert.ok(optionalReads.length > 0);
  assert.deepEqual(
    optionalReads.filter(({ method }) => method !== 'get').map(({ key }) => key),
    [],
  );
});

test('authenticated mutations require principal binding and document the conflict envelope', () => {
  const document = new MetaService().getOpenApi();
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      const security = operation.security ?? document.security ?? [];
      const expected =
        ['delete', 'patch', 'post', 'put'].includes(method) &&
        security.some((requirement) => 'accessCookie' in requirement);
      const binding = operation.parameters?.find(
        (item) => item.in === 'header' && item.name === PRINCIPAL_BINDING_HEADER,
      );
      assert.equal(Boolean(binding), expected, `${method} ${path} principal binding`);
      if (binding) {
        assert.equal(binding.required, true);
        assert.ok(operation.responses['409']);
      }
    }
  }
});

test('OpenAPI query and path constraints are projected from runtime Zod schemas', () => {
  const document = new MetaService().getOpenApi();
  const feedJson = z.toJSONSchema(feedQuerySchema, { unrepresentable: 'any', io: 'input' });
  const searchJson = z.toJSONSchema(searchQuerySchema, { unrepresentable: 'any', io: 'input' });
  for (const name of ['limit', 'cursor', 'sort']) {
    assert.deepEqual(getParameter(document, '/feed', 'get', name).schema, feedJson.properties[name]);
  }
  for (const name of ['limit', 'cursor', 'q', 'type']) {
    assert.deepEqual(getParameter(document, '/search', 'get', name).schema, searchJson.properties[name]);
  }
  assert.deepEqual(
    getParameter(document, '/ls/{id}', 'get', 'id').schema,
    z.toJSONSchema(ulidSchema, { unrepresentable: 'any' }),
  );
  assert.deepEqual(
    getParameter(document, '/users/{username}/ls', 'get', 'username').schema,
    z.toJSONSchema(usernameInputSchema, { unrepresentable: 'any' }),
  );
  assert.equal(document.components.schemas.UpdateLInput.minProperties, 1);
  assert.equal(document.components.schemas.UpdateUserInput.minProperties, 1);
});

test('sidebar cache contract and static discovery caches are explicit', () => {
  const document = new MetaService().getOpenApi();
  assert.equal(
    document.paths['/feed/sidebar'].get.responses['200'].headers['Cache-Control'].schema.const,
    'private, no-store, max-age=0',
  );
  const cacheControl = (handler) =>
    (Reflect.getMetadata(HEADERS_METADATA, handler) ?? []).find(
      (header) => header.name.toLowerCase() === 'cache-control',
    )?.value;
  assert.equal(cacheControl(MetaController.prototype.enums), STATIC_METADATA_CACHE_CONTROL);
  assert.equal(cacheControl(MetaController.prototype.openApi), STATIC_METADATA_CACHE_CONTROL);
});

test('OpenAPI marks operational health probes as internal and unauthenticated', () => {
  const document = new MetaService().getOpenApi();
  for (const component of ['private-api', 'database', 'session-authority']) {
    const operation = document.paths[`/health/${component}`].get;
    assert.deepEqual(operation.security, []);
    assert.equal(operation['x-internal'], true);
    assert.deepEqual(operation.tags, ['operations']);
    assert.ok(operation.responses['200']);
  }
});

test('OpenAPI and enum metadata are built once and frozen where appropriate', () => {
  const first = new MetaService();
  const second = new MetaService();
  assert.strictEqual(first.getOpenApi(), first.getOpenApi());
  const enums = first.getEnums();
  assert.strictEqual(first.getEnums(), enums);
  assert.strictEqual(second.getEnums(), enums);
  assert.ok(Object.isFrozen(enums));
  assert.equal('lCategory' in enums, false);
});
