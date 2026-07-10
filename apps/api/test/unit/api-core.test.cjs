const assert = require('node:assert/strict');
const test = require('node:test');

require('reflect-metadata');

const { BadRequestException } = require('@nestjs/common');
const {
  createLInputSchema,
  paginationQuerySchema,
  searchQuerySchema,
} = require('@linkedout/contracts');

const {
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

function captureResponse() {
  const response = {
    statusCode: undefined,
    body: undefined,
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
      return { getResponse: () => response };
    },
  };
  return { host, response };
}

test('ZodValidationPipe applies defaults and coercions for valid input', () => {
  const pipe = new ZodValidationPipe(createLInputSchema);
  const parsed = pipe.transform({
    title: 'Rejected after the final round',
    story: 'The panel feedback was clear and useful.',
    eventDate: '2026-01-02',
  });

  assert.equal(parsed.type, 'L');
  assert.equal(parsed.visibility, 'PUBLIC');
  assert.equal(parsed.isAnonymous, false);
  assert.deepEqual(parsed.tags, []);
  assert.ok(parsed.eventDate instanceof Date);
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

  assert.throws(
    () => new ZodValidationPipe(createLInputSchema).transform({
      title: 'Rejected after the final round',
      story: 'The panel feedback was clear and useful.',
      eventDate: '12345',
    }),
    (error) => {
      assertAppError(error, 400, 'VALIDATION_ERROR');
      assert.equal(errorBody(error).details[0].field, 'eventDate');
      return true;
    },
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

test('OptionalAuthGuard never blocks anonymous reads', () => {
  const guard = new OptionalAuthGuard();
  const user = { id: 'user_1', username: 'kartik' };

  assert.equal(guard.handleRequest(null, false), undefined);
  assert.equal(guard.handleRequest(null, user), user);
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
