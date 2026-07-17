'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

require('reflect-metadata');

const { RequestMethod } = require('@nestjs/common');
const { z } = require('zod');
const {
  GUARDS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
  VERSION_METADATA,
} = require('@nestjs/common/constants');
const { RouteParamtypes } = require('@nestjs/common/enums/route-paramtypes.enum');
const {
  feedFilterSchema,
  feedSortSchema,
  lTypeSchema,
  reactionTypeSchema,
  searchTypeSchema,
} = require('@linkedout/contracts');
const contractsV2 = require('@linkedout/contracts/v2');

const { AppModule } = require('../../dist/app.module');
const { ZodValidationPipe } = require('../../dist/common/pipes/zod-validation.pipe');
const {
  API_CONTRACT_METADATA,
  API_ROUTE_CONTRACTS,
  API_ROUTE_CONTRACT_BY_KEY,
} = require('../../dist/common/contracts/api-route-contracts');
const {
  API_ROUTE_CONTRACTS_V2,
  API_ROUTE_CONTRACT_BY_KEY_V2,
} = require('../../dist/common/contracts/api-route-contracts-v2');
const { MetaController } = require('../../dist/modules/meta/meta.controller');
const { MetaService } = require('../../dist/modules/meta/meta.service');

const HTTP_METHODS = new Set(['delete', 'get', 'head', 'options', 'patch', 'post', 'put']);
const KNOWN_GUARDS = new Set([
  'GithubAuthGuard',
  'GoogleAuthGuard',
  'JwtAuthGuard',
  'OptionalAuthGuard',
  'StrictOptionalAuthGuard',
]);
// Refresh validates this cookie inside the handler rather than through a Nest guard.
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
  if (reference && typeof reference.forwardRef === 'function') {
    return moduleType(reference.forwardRef());
  }
  if (reference && typeof reference.module === 'function') return reference.module;
  throw new TypeError(`Cannot inspect Nest module reference: ${String(reference)}`);
}

/**
 * Follow the same @Module imports graph that Nest boots. Keeping controller discovery here
 * prevents a newly-imported module from silently escaping the contract parity gate.
 */
async function registeredControllers(rootModule) {
  const controllers = new Set();
  const visitedModules = new Set();
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

    if (visitedModules.has(Module)) continue;
    visitedModules.add(Module);

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
  for (const name of names) {
    assert.ok(KNOWN_GUARDS.has(name), `classify OpenAPI security for guard ${name}`);
  }
  return new Set(names);
}

function expectedSecurity(guards) {
  if (guards.has('JwtAuthGuard')) return [{ accessCookie: [] }];
  if (guards.has('OptionalAuthGuard') || guards.has('StrictOptionalAuthGuard')) {
    return [{}, { accessCookie: [] }];
  }
  return [];
}

function expectedSuccessStatus(method, handler, guards) {
  if (guards.has('GoogleAuthGuard') || guards.has('GithubAuthGuard')) return 302;
  const explicit = Reflect.getMetadata(HTTP_CODE_METADATA, handler);
  if (explicit !== undefined) return explicit;
  return method === RequestMethod.POST ? 201 : 200;
}

function versionsFor(Controller, handler) {
  const declared =
    Reflect.getMetadata(VERSION_METADATA, handler) ??
    Reflect.getMetadata(VERSION_METADATA, Controller) ??
    '1';
  return new Set([declared].flat());
}

async function controllerOperations(version = '1') {
  const operations = new Map();
  for (const Controller of await registeredControllers(AppModule)) {
    const controllerPaths = [Reflect.getMetadata(PATH_METADATA, Controller) ?? ''].flat();
    for (const methodName of Object.getOwnPropertyNames(Controller.prototype)) {
      const handler = Controller.prototype[methodName];
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      const handlerMetadata = Reflect.getMetadata(PATH_METADATA, handler);
      if (method === undefined || handlerMetadata === undefined) continue;
      if (!versionsFor(Controller, handler).has(version)) continue;

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
  const parameter = document.paths[path][method].parameters?.find((item) => item.name === name);
  assert.ok(parameter, `${method.toUpperCase()} ${path} documents ${name}`);
  return parameter;
}

test('OpenAPI documents every registered controller operation and no phantom routes', async () => {
  const document = new MetaService({}).getOpenApi();
  assert.deepEqual(
    [...documentedOperations(document).keys()].sort(),
    [...(await controllerOperations()).keys()].sort(),
  );
});

test('OpenAPI security and success statuses match registered guards and Nest handlers', async () => {
  const document = new MetaService({}).getOpenApi();
  const documented = documentedOperations(document);

  for (const expected of (await controllerOperations()).values()) {
    const operation = documented.get(expected.key);
    assert.ok(operation, `${expected.key} is documented`);
    assert.deepEqual(
      operation.security ?? document.security ?? [],
      expected.security,
      `${expected.key} security`,
    );
    assert.ok(
      operation.responses[String(expected.status)],
      `${expected.key} documents its ${expected.status} success response`,
    );
  }

  // Refresh reads its credential directly because rotation is not an access-token guard.
  assert.deepEqual(document.paths['/auth/refresh'].post.security, [{ refreshCookie: [] }]);
  assert.deepEqual(document.components.securitySchemes, {
    accessCookie: { type: 'apiKey', in: 'cookie', name: 'lo_access' },
    refreshCookie: { type: 'apiKey', in: 'cookie', name: 'lo_refresh' },
  });
});

test('one route contract drives each handler body pipe and OpenAPI success response', async () => {
  const document = new MetaService({}).getOpenApi();
  const documented = documentedOperations(document);
  const registered = await controllerOperations();

  assert.deepEqual(
    [...API_ROUTE_CONTRACT_BY_KEY.keys()].sort(),
    [...registered.keys()].sort(),
    'the route contract registry has exactly the live Nest operations',
  );

  for (const operation of registered.values()) {
    const contract = Reflect.getMetadata(API_CONTRACT_METADATA, operation.handler);
    assert.strictEqual(
      contract,
      API_ROUTE_CONTRACT_BY_KEY.get(operation.key),
      `${operation.key} handler binds the canonical route contract`,
    );

    const bodyArguments = Object.entries(
      Reflect.getMetadata(ROUTE_ARGS_METADATA, operation.Controller, operation.methodName) ?? {},
    ).filter(([metadataKey]) => metadataKey.startsWith(`${RouteParamtypes.BODY}:`));

    if (contract.body) {
      assert.equal(bodyArguments.length, 1, `${operation.key} has one declared request body`);
      const [, bodyArgument] = bodyArguments[0];
      const validationPipes = bodyArgument.pipes.filter(
        (pipe) => pipe instanceof ZodValidationPipe,
      );
      assert.equal(
        validationPipes.length,
        1,
        `${operation.key} body uses one ZodValidationPipe`,
      );
      assert.strictEqual(
        validationPipes[0].contractSchema,
        contract.body.schema,
        `${operation.key} body pipe uses the canonical schema`,
      );
    } else {
      assert.equal(bodyArguments.length, 0, `${operation.key} does not accept an undocumented body`);
    }

    const documentedOperation = documented.get(operation.key);
    const successResponse = documentedOperation.responses[String(contract.status)];
    assert.ok(successResponse, `${operation.key} emits its canonical success status`);
    if (contract.response.name) {
      assert.equal(
        successResponse.content['application/json'].schema.$ref,
        `#/components/schemas/${contract.response.name}`,
        `${operation.key} emits its canonical response schema`,
      );
    } else {
      assert.equal(successResponse.content, undefined, `${operation.key} has no JSON response body`);
    }
  }

  assert.equal(
    new Set(Object.values(API_ROUTE_CONTRACTS)).size,
    Object.keys(API_ROUTE_CONTRACTS).length,
    'named route contracts do not alias different operations accidentally',
  );
});

test('v2 OpenAPI and route contracts cover exactly the registered v2 operations', async () => {
  const document = new MetaService({}).getV2OpenApi();
  const documented = documentedOperations(document);
  const registered = await controllerOperations('2');

  assert.deepEqual([...documented.keys()].sort(), [...registered.keys()].sort());
  assert.deepEqual(
    [...API_ROUTE_CONTRACT_BY_KEY_V2.keys()].sort(),
    [...registered.keys()].sort(),
  );
  assert.deepEqual(
    [...API_ROUTE_CONTRACT_BY_KEY_V2.keys()].sort(),
    [
      ...[...API_ROUTE_CONTRACT_BY_KEY.keys()].filter((key) => key !== 'get /tags/popular'),
      'get /feed/sidebar',
    ].sort(),
    'v2 carries every v1 operation except the explicitly removed popular-tags route',
  );

  for (const operation of registered.values()) {
    const contract = API_ROUTE_CONTRACT_BY_KEY_V2.get(operation.key);
    assert.strictEqual(
      Reflect.getMetadata(API_CONTRACT_METADATA, operation.handler),
      contract,
      `${operation.key} handler binds the canonical v2 route contract`,
    );
    const documentedOperation = documented.get(operation.key);
    assert.deepEqual(
      documentedOperation.security ?? document.security ?? [],
      operation.security,
      `${operation.key} security`,
    );
    assert.ok(documentedOperation.responses[String(contract.status)]);
    if (contract.response.name) {
      assert.equal(
        documentedOperation.responses[String(contract.status)].content['application/json'].schema.$ref,
        `#/components/schemas/${contract.response.name}`,
      );
    }
    for (const status of ['400', '401', '404', '429', '500']) {
      assert.equal(
        documentedOperation.responses[status].content['application/json'].schema.$ref,
        '#/components/schemas/ErrorEnvelope',
        `${operation.key} documents the ${status} error envelope`,
      );
    }

    const bodyArguments = Object.entries(
      Reflect.getMetadata(ROUTE_ARGS_METADATA, operation.Controller, operation.methodName) ?? {},
    ).filter(([metadataKey]) => metadataKey.startsWith(`${RouteParamtypes.BODY}:`));
    if (contract.body) {
      assert.equal(bodyArguments.length, 1, `${operation.key} has one declared v2 request body`);
      const validationPipes = bodyArguments[0][1].pipes.filter(
        (pipe) => pipe instanceof ZodValidationPipe,
      );
      assert.equal(validationPipes.length, 1);
      assert.strictEqual(validationPipes[0].contractSchema, contract.body.schema);
    } else {
      assert.equal(bodyArguments.length, 0, `${operation.key} has no undocumented v2 body`);
    }
  }

  assert.equal(document.info.version, '2.0.0');
  assert.deepEqual(document.servers, [{ url: '/v2' }]);
  assert.ok(document.components.schemas.FeedSidebarResponse);
  assert.equal(
    document.paths['/feed/sidebar'].get.responses['200'].headers['Cache-Control'].schema.const,
    'private, no-store, max-age=0',
  );
  assert.equal(document.paths['/feed'].get.parameters.some((parameter) => parameter.name === 'filter'), false);
  assert.equal(document.paths['/search'].get.parameters.some((parameter) => parameter.name === 'filter'), false);
  assert.equal(document.paths['/tags/popular'], undefined);
  assert.equal(
    new Set(Object.values(API_ROUTE_CONTRACTS_V2)).size,
    Object.keys(API_ROUTE_CONTRACTS_V2).length,
    'v2 route contracts do not alias distinct operations',
  );
});

test('OpenAPI is built once and reused across requests', () => {
  const service = new MetaService({});
  assert.strictEqual(service.getOpenApi(), service.getOpenApi());
});

test('public enum metadata is built once and reused across services and handler calls', () => {
  const firstService = new MetaService({});
  const secondService = new MetaService({});
  const controller = new MetaController(firstService);

  const cached = firstService.getEnums();
  assert.strictEqual(firstService.getEnums(), cached);
  assert.strictEqual(secondService.getEnums(), cached);
  assert.strictEqual(controller.enums(), cached);
  assert.strictEqual(controller.enums(), cached);
  assert.ok(Object.isFrozen(cached));
  assert.ok(Object.values(cached).every((metadata) => Object.isFrozen(metadata)));
});

test('static discovery routes are publicly cacheable but popular tags stay dynamic', () => {
  const cacheControl = (handler) =>
    (Reflect.getMetadata(HEADERS_METADATA, handler) ?? []).find(
      (header) => header.name.toLowerCase() === 'cache-control',
    )?.value;

  assert.equal(cacheControl(MetaController.prototype.enums), STATIC_METADATA_CACHE_CONTROL);
  assert.equal(cacheControl(MetaController.prototype.openApi), STATIC_METADATA_CACHE_CONTROL);
  assert.equal(cacheControl(MetaController.prototype.popularTags), undefined);
});

test('OpenAPI query and path parameters stay aligned with shared contracts', () => {
  const document = new MetaService({}).getOpenApi();

  assert.equal(document.components.schemas.UpdateLInput.minProperties, 1);
  assert.equal(document.components.schemas.UpdateUserInput.minProperties, 1);

  assert.deepEqual(
    getParameter(document, '/feed', 'get', 'sort').schema.enum,
    feedSortSchema.options,
  );
  assert.deepEqual(
    getParameter(document, '/feed', 'get', 'filter').schema.enum,
    feedFilterSchema.options,
  );
  assert.deepEqual(
    getParameter(document, '/users/{username}/ls', 'get', 'type').schema.enum,
    lTypeSchema.options,
  );
  assert.deepEqual(
    getParameter(document, '/ls/{id}/reactions/{type}', 'put', 'type').schema.enum,
    reactionTypeSchema.options,
  );
  assert.deepEqual(
    getParameter(document, '/search', 'get', 'type').schema.enum,
    searchTypeSchema.options,
  );
  assert.equal(getParameter(document, '/tags/popular', 'get', 'q').schema.maxLength, 30);

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      const cursor = operation.parameters?.find((parameter) => parameter.name === 'cursor');
      if (cursor) assert.equal(cursor.schema.minLength, 1, `${method} ${path} cursor minLength`);
    }
  }
});

test('v2 OpenAPI derives query and path constraints from runtime Zod schemas', () => {
  const document = new MetaService({}).getV2OpenApi();
  const feedQueryJson = z.toJSONSchema(contractsV2.feedQuerySchema, {
    unrepresentable: 'any',
    io: 'input',
  });
  const searchQueryJson = z.toJSONSchema(contractsV2.searchQuerySchema, {
    unrepresentable: 'any',
    io: 'input',
  });

  for (const name of ['limit', 'cursor', 'sort']) {
    const parameter = getParameter(document, '/feed', 'get', name);
    assert.deepEqual(parameter.schema, feedQueryJson.properties[name]);
    assert.equal(parameter.required, false);
  }
  for (const name of ['limit', 'cursor', 'q', 'type']) {
    const parameter = getParameter(document, '/search', 'get', name);
    assert.deepEqual(parameter.schema, searchQueryJson.properties[name]);
    assert.equal(parameter.required, name === 'q');
  }
  assert.deepEqual(
    getParameter(document, '/ls/{id}', 'get', 'id').schema,
    z.toJSONSchema(contractsV2.ulidSchema, { unrepresentable: 'any' }),
  );
  assert.deepEqual(
    getParameter(document, '/users/{username}/ls', 'get', 'username').schema,
    z.toJSONSchema(contractsV2.usernameInputSchema, { unrepresentable: 'any' }),
  );
});
