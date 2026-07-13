# CONTRACT-01 — strict request validation (status)

Split into two tracked slices. **01A is done; 01B is open.**

## CONTRACT-01A — strict mutation bodies + privacy protection (DONE)

- All request **body** schemas are `.strict()`: `createLInput`, `updateLInput`, `updateUserInput`,
  `createCommentInput`, `createCollectionInput`, `updateCollectionInput`,
  `addLToCollectionInput`, `avatarUploadRequest` (`packages/contracts/src/*`).
- PATCH bodies (`updateLInput`, `updateUserInput`) reject an empty object (non-empty refinement).
- Unknown-key errors name the offending key instead of `field: ""`
  (`apps/api/src/common/pipes/zod-validation.pipe.ts`).
- Regression tests: privacy typos (`visiblity`/`isAnynomous`) → 400 and never reach the feed;
  unknown fields on L/user/comment/collection/upload → 400; empty L/user PATCH → 400
  (`apps/api/test/integration/subparts/{05,08,10,13,16,20}`).

## CONTRACT-01B — query strictness, OpenAPI, and remaining coverage (OPEN)

Deliberately deferred (query strictness has real edge cases — OAuth nav params, cache-busters —
that need per-schema decisions):

- [ ] Make query objects strict: `paginationQuery` (`common.ts`), `oauthStartQuery` (`auth.ts`),
      `popularTagsQuery` (`meta.ts`), and the derived `feed`/`search`/`userLs`/`journey` queries.
      Today `?tyep=users` is silently ignored and search falls back to Ls.
- [x] Emit `minProperties: 1` for PATCH bodies in the generated OpenAPI (a Zod `.refine` does not
      surface it — emitted at the component-generation seam in
      `apps/api/src/modules/meta/openapi.ts`).
- [ ] Query-object regression tests (unknown query params → 400; discriminated search params).
- [ ] Decide per-endpoint whether extra query params are rejected or tolerated (e.g. tracking
      params on the OAuth start redirect).

Until 01B lands, do not describe "all external request objects" as strict.
