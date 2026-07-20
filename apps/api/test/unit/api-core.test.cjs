const assert = require('node:assert/strict');
const test = require('node:test');

require('reflect-metadata');

const { BadRequestException, UnauthorizedException } = require('@nestjs/common');
const {
  createLInputSchema,
  oauthHandoffExchangeInputSchema,
  oauthHandoffExchangeResponseSchema,
  paginationQuerySchema,
  searchQuerySchema,
} = require('@linkedout/contracts');

const {
  AppException,
  AppErrors,
} = require('../../dist/common/errors/app-exception');
const {
  AllExceptionsFilter,
} = require('../../dist/common/filters/all-exceptions.filter');
const {
  JwtAuthGuard,
} = require('../../dist/common/guards/jwt-auth.guard');
const {
  OptionalAuthGuard,
} = require('../../dist/common/guards/optional-auth.guard');
const {
  ZodValidationPipe,
} = require('../../dist/common/pipes/zod-validation.pipe');
const {
  applyDefaultPrivateCachePolicy,
  DEFAULT_PRIVATE_CACHE_CONTROL,
} = require('../../dist/common/http/cache-policy');
const {
  requestPathForLogging,
} = require('../../dist/common/http/request-path');
const {
  buildPage,
  mapPage,
} = require('../../dist/common/pagination/paginate');
const {
  decodeCursor,
  decodeCursorId,
  encodeCursor,
} = require('../../dist/common/pagination/cursor');

function errorBody(error) {
  return error.getResponse();
}

function assertAppError(error, status, code) {
  assert.equal(error.getStatus(), status);
  assert.equal(errorBody(error).code, code);
  return true;
}

function captureResponse(request = { method: 'GET', path: '/test', url: '/test' }) {
  const response = {
    statusCode: undefined,
    body: undefined,
    headers: new Map(),
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return this.headers.get(name.toLowerCase());
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp() {
      return { getResponse: () => response, getRequest: () => request };
    },
  };
  return { host, response };
}

test('response cache policy defaults private and preserves explicit public caching', () => {
  for (const existing of [undefined, 'public, max-age=60']) {
    const headers = new Map();
    if (existing) headers.set('cache-control', existing);
    const response = {
      hasHeader: (name) => headers.has(name.toLowerCase()),
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
    };
    let continued = false;
    applyDefaultPrivateCachePolicy({}, response, () => {
      continued = true;
    });
    assert.equal(continued, true);
    assert.equal(headers.get('cache-control'), existing ?? DEFAULT_PRIVATE_CACHE_CONTROL);
  }
});

test('ZodValidationPipe applies defaults and coercions for valid input', () => {
  const pipe = new ZodValidationPipe(createLInputSchema);
  const parsed = pipe.transform({
    title: 'Rejected after the final round',
    story: 'The panel feedback was clear and useful.',
  });

  assert.equal(parsed.type, 'L');
  assert.equal(parsed.visibility, 'PUBLIC');
  assert.equal(parsed.isAnonymous, false);
  assert.deepEqual(Object.keys(parsed).sort(), [
    'isAnonymous',
    'story',
    'title',
    'type',
    'visibility',
  ]);
});

test('ZodValidationPipe returns field-level validation errors for bad L input', () => {
  const pipe = new ZodValidationPipe(createLInputSchema);

  assert.throws(
    () => pipe.transform({ title: '', story: '', tags: ['a', 'b', 'c', 'd', 'e', 'f'] }),
    (error) => {
      assertAppError(error, 400, 'VALIDATION_ERROR');
      const fields = errorBody(error).details.map((detail) => detail.field);
      assert.deepEqual(fields.sort(), ['story', 'tags', 'title']);
      return true;
    },
  );
});

test('query validation rejects impossible pagination and search values', () => {
  const paginationPipe = new ZodValidationPipe(paginationQuerySchema());
  const searchPipe = new ZodValidationPipe(searchQuerySchema);

  assert.equal(paginationPipe.transform({}).limit, 20);
  assert.equal(paginationPipe.transform({ limit: '5' }).limit, 5);

  assert.throws(
    () => paginationPipe.transform({ limti: '5' }),
    (error) => {
      assertAppError(error, 400, 'VALIDATION_ERROR');
      assert.equal(errorBody(error).details[0].field, 'limti');
      return true;
    },
  );

  assert.throws(
    () => paginationPipe.transform({ limit: '0' }),
    (error) => {
      assertAppError(error, 400, 'VALIDATION_ERROR');
      assert.equal(errorBody(error).details[0].field, 'limit');
      return true;
    },
  );

  assert.throws(
    () => searchPipe.transform({ q: '', type: 'users' }),
    (error) => {
      assertAppError(error, 400, 'VALIDATION_ERROR');
      assert.equal(errorBody(error).details[0].field, 'q');
      return true;
    },
  );

  for (const query of [
    { q: 'builder', tyep: 'users' },
    { q: 'builder', type: 'users', filter: 'career' },
  ]) {
    assert.throws(
      () => searchPipe.transform(query),
      (error) => assertAppError(error, 400, 'VALIDATION_ERROR'),
    );
  }

});

test('OAuth handoff contracts keep identity and navigation server-bound', () => {
  const code = 'A'.repeat(43);
  assert.deepEqual(oauthHandoffExchangeInputSchema.parse({ code }), { code });
  assert.throws(() => oauthHandoffExchangeInputSchema.parse({ code, sub: 'attacker' }));
  assert.throws(() => oauthHandoffExchangeInputSchema.parse({ code: 'short' }));

  const response = {
    cookie: 'A'.repeat(43),
    expiresAt: '2026-07-18T12:00:00.000Z',
    returnTo: '/journey?view=recent',
  };
  assert.deepEqual(oauthHandoffExchangeResponseSchema.parse(response), response);
  assert.throws(() =>
    oauthHandoffExchangeResponseSchema.parse({ ...response, returnTo: 'https://evil.example' }),
  );
  assert.throws(() =>
    oauthHandoffExchangeResponseSchema.parse({ ...response, sub: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
  );
});

test('JwtAuthGuard allows valid users and rejects missing or expired tokens', () => {
  const guard = new JwtAuthGuard();
  const user = { id: 'user_1', username: 'kartik' };

  assert.equal(guard.handleRequest(null, user, null), user);

  assert.throws(
    () => guard.handleRequest(null, false, null),
    (error) => assertAppError(error, 401, 'UNAUTHENTICATED'),
  );

  const expired = new Error('jwt expired');
  expired.name = 'TokenExpiredError';
  assert.throws(
    () => guard.handleRequest(null, false, expired),
    (error) => assertAppError(error, 401, 'TOKEN_EXPIRED'),
  );
});

test('OptionalAuthGuard allows absent credentials but rejects invalid presented credentials', () => {
  const guard = new OptionalAuthGuard();
  const user = { id: 'user_1', username: 'kartik' };
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, cookies: {} }) }),
  };

  assert.equal(guard.canActivate(context), true);
  assert.equal(guard.handleRequest(null, user), user);
  assert.throws(
    () => guard.handleRequest(new UnauthorizedException(), false),
    (error) => assertAppError(error, 401, 'UNAUTHENTICATED'),
  );

  const outage = new Error('principal store unavailable');
  assert.throws(() => guard.handleRequest(outage, false), outage);
});

test('internal assertions are authoritative in every guard and infrastructure failures surface', async () => {
  const user = { id: 'user_1', username: 'kartik' };
  const request = { headers: { 'x-internal-auth': 'assertion' } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  };
  const guard = new JwtAuthGuard({
    async authenticateInternal() {
      return { kind: 'authenticated', user, sid: 'session_1' };
    },
  });
  assert.equal(await guard.canActivate(context), true);
  assert.equal(request.user, user);

  const invalid = new OptionalAuthGuard({
    async authenticateInternal() {
      return { kind: 'invalid' };
    },
  });
  await assert.rejects(
    () => invalid.canActivate(context),
    (error) => assertAppError(error, 401, 'UNAUTHENTICATED'),
  );

  const outage = new Error('session dependency unavailable');
  const unavailable = new OptionalAuthGuard({
    async authenticateInternal() {
      throw outage;
    },
  });
  await assert.rejects(() => unavailable.canActivate(context), outage);
});

test('AllExceptionsFilter always renders the standard error envelope', () => {
  const filter = new AllExceptionsFilter();

  {
    const { host, response } = captureResponse();
    filter.catch(AppErrors.lNotFound(), host);
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, {
      error: {
        code: 'L_NOT_FOUND',
        message: 'This L does not exist or is not visible to you.',
        details: undefined,
      },
    });
    assert.equal(response.getHeader('cache-control'), DEFAULT_PRIVATE_CACHE_CONTROL);
  }

  {
    const { host, response } = captureResponse();
    filter.catch(new BadRequestException(['bad limit', 'bad cursor']), host);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: { code: 'BAD_REQUEST', message: 'bad limit, bad cursor' },
    });
  }

  {
    const { host, response } = captureResponse();
    filter.logger.error = () => {};
    filter.catch(new Error('database went away'), host);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      error: { code: 'INTERNAL', message: 'Something went wrong.' },
    });
  }
});

test('security rejection telemetry excludes credentials, assertions, OAuth codes, and queries', () => {
  const filter = new AllExceptionsFilter();
  const messages = [];
  filter.logger.warn = (message) => messages.push(message);
  const { host } = captureResponse({
    method: 'POST',
    path: '/v1/auth/sessions/resolve',
    url: '/v1/auth/sessions/resolve?code=oauth-secret',
    headers: { cookie: 'lo_sid=browser-secret', 'x-internal-auth': 'assertion-secret' },
  });

  filter.catch(AppErrors.unauthenticated(), host);
  assert.deepEqual(messages, [
    'security_rejection code=UNAUTHENTICATED method=POST path=/v1/auth/sessions/resolve',
  ]);
  assert.doesNotMatch(messages[0], /oauth-secret|browser-secret|assertion-secret|\?/);
});

test('security telemetry is explicit backend metadata, not inferred from the wire code', () => {
  const securityErrors = [
    AppErrors.unauthenticated(),
    AppErrors.tokenExpired(),
    AppErrors.invalidHandoff(),
    AppErrors.principalMismatch(),
  ];
  for (const error of securityErrors) {
    assert.equal(error.telemetryClassification, 'security-rejection');
    assert.equal('telemetryClassification' in error.getResponse(), false);
  }
  assert.equal(AppErrors.forbidden().telemetryClassification, undefined);

  const filter = new AllExceptionsFilter();
  const messages = [];
  filter.logger.warn = (message) => messages.push(message);
  const { host } = captureResponse();
  filter.catch(
    new AppException(401, { code: 'UNAUTHENTICATED', message: 'A non-security domain error.' }),
    host,
  );
  assert.deepEqual(messages, [], 'a code string alone must not opt an exception into security logs');
});

test('the AppException runtime guard rejects codes outside its declared catalogue', () => {
  const filter = new AllExceptionsFilter();
  const { host, response } = captureResponse();
  filter.catch(
    new AppException(418, { code: 'NOT_CATALOGUED', message: 'invalid body' }),
    host,
  );

  assert.equal(response.statusCode, 418);
  assert.deepEqual(response.body, { error: { code: 'ERROR', message: 'invalid body' } });
});

test('the AppException runtime guard rejects malformed details on a valid code', () => {
  const filter = new AllExceptionsFilter();
  const { host, response } = captureResponse();
  filter.catch(
    new AppException(400, { code: 'VALIDATION_ERROR', message: 'invalid details', details: 7 }),
    host,
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: { code: 'BAD_REQUEST', message: 'invalid details' } });
});

test('request log paths prefer Express routing and never retain query parameters', () => {
  assert.equal(
    requestPathForLogging({ path: '/v1/search', url: '/ignored?token=secret' }),
    '/v1/search',
  );
  assert.equal(requestPathForLogging({ path: '', url: '/v1/search?q=secret' }), '/v1/search');
  assert.equal(requestPathForLogging({ path: '', url: '?token=secret' }), '/');
  assert.equal(requestPathForLogging({ path: '', url: '' }), '/');
});

test('cursor helpers round-trip good cursors and reject malformed cursors', () => {
  const cursor = encodeCursor({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', score: 12 });

  assert.deepEqual(decodeCursor(cursor), {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    score: 12,
  });
  assert.equal(decodeCursorId(encodeCursor({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' })), '01ARZ3NDEKTSV4RRFFQ69G5FAV');

  assert.throws(
    () => decodeCursor('not-base64-json'),
    (error) => assertAppError(error, 400, 'BAD_CURSOR'),
  );

  assert.throws(
    () => decodeCursorId(encodeCursor({ score: 12 })),
    (error) => assertAppError(error, 400, 'BAD_CURSOR'),
  );
});

test('pagination keeps the extra row out and exposes the next cursor', () => {
  const page = buildPage([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 2, (row) => `cursor:${row.id}`);

  assert.deepEqual(page.rows, [{ id: 'a' }, { id: 'b' }]);
  assert.equal(page.nextCursor, 'cursor:b');
  assert.deepEqual(mapPage(page, (row) => row.id), {
    data: ['a', 'b'],
    nextCursor: 'cursor:b',
  });
});
