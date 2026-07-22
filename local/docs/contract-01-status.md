# CONTRACT-01 — strict request validation (complete)

Status: **CONTRACT-01A and CONTRACT-01B are implemented and verified.**

## CONTRACT-01A — strict mutation bodies and privacy protection

- All external mutation-body schemas are `.strict()`, including `createLInput`, `updateLInput`,
  `updateUserInput`, `createCommentInput`, and `avatarUploadRequest`.
- PATCH bodies reject an empty object where the operation must change at least one field.
- Unknown-key errors identify the offending key instead of returning an empty field path.
- Regression coverage proves privacy typos and unknown mutation fields return
  `400 VALIDATION_ERROR` before business logic runs.

## CONTRACT-01B — strict query objects and OpenAPI parity

- Pagination, OAuth start, feed, search, user-L, and other documented query
  schemas reject unknown parameters.
- The OAuth start route follows the same strict policy: only its documented `returnTo` parameter is
  accepted. Tracking or cache-buster parameters are not silently tolerated.
- Discriminated search rejects misspelled and incompatible parameters instead of falling back to L
  search.
- Generated OpenAPI reflects query constraints and `minProperties: 1` for non-empty PATCH bodies.
- Integration coverage checks unknown query parameters across every list endpoint and verifies
  search discriminator behavior against the real API and PostgreSQL.

## Authority and verification

Runtime Zod schemas and generated OpenAPI are authoritative. The completion is protected by:

- contract and OpenAPI unit tests;
- route-contract/OpenAPI parity tests;
- real-HTTP integration tests for strict queries, bodies, and error envelopes; and
- CI typecheck, lint, unit, integration, and browser jobs.

Any future request parameter must be added deliberately to the shared schema, generated OpenAPI,
runtime tests, and the applicable narrative contract.
