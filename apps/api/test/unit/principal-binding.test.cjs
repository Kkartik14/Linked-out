'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PRINCIPAL_BINDING_HEADER,
} = require('@linkedout/contracts');
const {
  PrincipalBindingInterceptor,
} = require('../../dist/common/interceptors/principal-binding.interceptor');

const USER_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const OTHER_ID = '01BX5ZZKBKACTAV9WEVGEMMVRZ';

function context(request) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

function next(value = Symbol('continued')) {
  return { value, handle: () => value };
}

function appError(error, status, code) {
  assert.equal(error.getStatus(), status);
  assert.equal(error.getResponse().code, code);
  return true;
}

test('authenticated unsafe requests require the exact render-time principal', () => {
  const interceptor = new PrincipalBindingInterceptor();
  const continuation = next();
  const base = {
    method: 'POST',
    user: { id: USER_ID, username: 'kartik' },
  };

  assert.equal(
    interceptor.intercept(
      context({
        ...base,
        headers: { [PRINCIPAL_BINDING_HEADER.toLowerCase()]: USER_ID },
      }),
      continuation,
    ),
    continuation.value,
  );
  assert.equal(
    interceptor.intercept(
      context({
        ...base,
        headers: { [PRINCIPAL_BINDING_HEADER.toLowerCase()]: USER_ID.toLowerCase() },
      }),
      continuation,
    ),
    continuation.value,
  );

  for (const declared of [undefined, OTHER_ID, 'not-a-ulid', [USER_ID, OTHER_ID]]) {
    assert.throws(
      () => interceptor.intercept(
        context({
          ...base,
          headers: declared === undefined
            ? {}
            : { [PRINCIPAL_BINDING_HEADER.toLowerCase()]: declared },
        }),
        continuation,
      ),
      (error) => appError(error, 409, 'PRINCIPAL_MISMATCH'),
    );
  }
});

test('safe, anonymous, and identity-lifecycle requests are outside principal binding', () => {
  const interceptor = new PrincipalBindingInterceptor();
  for (const request of [
    { method: 'GET', headers: {}, user: { id: USER_ID, username: 'kartik' } },
    { method: 'HEAD', headers: {}, user: { id: USER_ID, username: 'kartik' } },
    { method: 'POST', headers: {} },
  ]) {
    const continuation = next();
    assert.equal(
      interceptor.intercept(context(request), continuation),
      continuation.value,
    );
  }
});
