const assert = require('node:assert/strict');
const test = require('node:test');

require('reflect-metadata');

const { LsService } = require('../../dist/modules/ls/ls.service');
const { CommentsService } = require('../../dist/modules/comments/comments.service');
const { CollectionsService } = require('../../dist/modules/collections/collections.service');
const { FollowsService } = require('../../dist/modules/follows/follows.service');
const { SearchService } = require('../../dist/modules/search/search.service');
const { UploadsService } = require('../../dist/modules/uploads/uploads.service');
const { UsersService } = require('../../dist/modules/users/users.service');
const {
  AvatarObjectUnavailableError,
  UsernameConflictError,
} = require('../../dist/modules/users/users.errors');
const { decodeCursor, encodeCursor } = require('../../dist/common/pagination/cursor');

const NOW = new Date('2026-01-02T03:04:05.000Z');
const USER_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const OTHER_ID = '01BRZ3NDEKTSV4RRFFQ69G5FAV';
const L_ID = '01CRZ3NDEKTSV4RRFFQ69G5FAV';
const COMMENT_ID = '01DRZ3NDEKTSV4RRFFQ69G5FAV';
const COLLECTION_ID = '01ERZ3NDEKTSV4RRFFQ69G5FAV';

function errorBody(error) {
  return error.getResponse();
}

function assertAppError(error, status, code) {
  assert.equal(error.getStatus(), status);
  assert.equal(errorBody(error).code, code);
  return true;
}

function userSummary(overrides = {}) {
  return {
    id: USER_ID,
    username: 'kartik',
    name: 'Kartik Gupta',
    image: null,
    status: 'BUILDING',
    ...overrides,
  };
}

function userProfileRow(overrides = {}) {
  return {
    ...userSummary(),
    bio: null,
    storiesShared: 1,
    lessonsShared: 2,
    lsShared: 4,
    collectionsCreated: 1,
    followerCount: 0,
    followingCount: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function lRow(overrides = {}) {
  const author = userSummary(overrides.author);
  return {
    id: L_ID,
    authorId: author.id,
    author,
    title: 'Rejected after the final round',
    story: 'I made it through every round and still missed the offer.',
    type: 'L',
    visibility: 'PUBLIC',
    isAnonymous: false,
    resolvedAt: null,
    reactionCount: 0,
    beenThereCount: 0,
    helpfulCount: 0,
    respectCount: 0,
    painCount: 0,
    savedCount: 0,
    commentCount: 0,
    popularityScore: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function commentRow(overrides = {}) {
  const author = userSummary(overrides.author);
  return {
    id: COMMENT_ID,
    authorId: author.id,
    author,
    lId: L_ID,
    parentId: null,
    body: 'This helped me reframe my own rejection.',
    createdAt: NOW,
    _count: { replies: 0 },
    ...overrides,
  };
}

function collectionRow(overrides = {}) {
  return {
    id: COLLECTION_ID,
    title: 'Interview lessons',
    slug: 'interview-lessons',
    ownerId: USER_ID,
    owner: userSummary(),
    createdAt: NOW,
    _count: { ls: 1 },
    ...overrides,
  };
}

test('LsService blocks non-visible Ls while allowing owners and followers', async () => {
  {
    const service = new LsService({
      findById: async () => lRow({ visibility: 'PRIVATE' }),
    });

    await assert.rejects(
      () => service.getDetail(L_ID, undefined),
      (error) => assertAppError(error, 404, 'L_NOT_FOUND'),
    );
  }

  {
    const service = new LsService({
      findById: async () => lRow({ visibility: 'PRIVATE' }),
      collectionsForL: async () => [],
      viewerReactions: async () => [],
    });
    const detail = await service.getDetail(L_ID, USER_ID);

    assert.equal(detail.viewer.canEdit, true);
    assert.equal(detail.author.username, 'kartik');
  }

  {
    const service = new LsService({
      findById: async () => lRow({ visibility: 'FOLLOWERS' }),
      viewerFollows: async (viewerId, authorId) => viewerId === OTHER_ID && authorId === USER_ID,
      collectionsForL: async () => [],
      viewerReactions: async () => [{ lId: L_ID, type: 'HELPFUL' }],
    });
    const detail = await service.getDetail(L_ID, OTHER_ID);

    assert.deepEqual(detail.viewer.reactions, ['HELPFUL']);
    assert.equal(detail.viewer.canEdit, false);
  }
});

test('LsService enforces onboarding and ownership for writes', async () => {
  await assert.rejects(
    () => new LsService({}).create(
      { id: USER_ID, username: null },
      { title: 'T', story: 'S', type: 'L', visibility: 'PUBLIC', isAnonymous: false },
    ),
    (error) => assertAppError(error, 403, 'FORBIDDEN'),
  );

  {
    const service = new LsService({
      updateOwnedL: async () => ({ status: 'not_owner' }),
    });

    await assert.rejects(
      () => service.update({ id: USER_ID, username: 'kartik' }, L_ID, { title: 'New title' }),
      (error) => assertAppError(error, 403, 'NOT_L_OWNER'),
    );
  }

  {
    const service = new LsService({
      deleteOwnedL: async () => ({ status: 'not_found' }),
    });

    await assert.rejects(
      () => service.remove({ id: USER_ID, username: 'kartik' }, L_ID),
      (error) => assertAppError(error, 404, 'L_NOT_FOUND'),
    );
  }
});

test('CommentsService blocks replies to replies and deletes by non-owners', async () => {
  const ls = {
    getViewableL: async () => lRow(),
  };

  {
    const service = new CommentsService(
      { findMeta: async () => ({ id: COMMENT_ID, lId: L_ID, authorId: OTHER_ID, parentId: 'parent' }) },
      ls,
    );

    await assert.rejects(
      () => service.createReply({ id: USER_ID, username: 'kartik' }, COMMENT_ID, { body: 'Reply' }),
      (error) => assertAppError(error, 400, 'VALIDATION_ERROR'),
    );
  }

  {
    const service = new CommentsService(
      { findMeta: async () => ({ id: COMMENT_ID, lId: L_ID, authorId: OTHER_ID, parentId: null }) },
      ls,
    );

    await assert.rejects(
      () => service.remove({ id: USER_ID, username: 'kartik' }, COMMENT_ID),
      (error) => assertAppError(error, 403, 'FORBIDDEN'),
    );
  }

  {
    const service = new CommentsService({}, ls);

    await assert.rejects(
      () => service.createOnL({ id: USER_ID, username: null }, L_ID, { body: 'Comment' }),
      (error) => assertAppError(error, 403, 'FORBIDDEN'),
    );
  }
});

test('CommentsService maps created comments and viewer delete permissions', async () => {
  const service = new CommentsService(
    {
      create: async () => commentRow({ authorId: USER_ID }),
    },
    {
      getViewableL: async () => lRow({ authorId: OTHER_ID, author: userSummary({ id: OTHER_ID, username: 'other' }) }),
    },
  );

  const comment = await service.createOnL(
    { id: USER_ID, username: 'kartik' },
    L_ID,
    { body: 'This helped.' },
  );

  assert.equal(comment.body, 'This helped me reframe my own rejection.');
  assert.equal(comment.viewer.canDelete, true);
});

test('UsersService rejects unsafe profile mutations', async () => {
  const config = { r2: { publicBaseUrl: 'https://cdn.example.test' } };

  {
    const service = new UsersService({}, config);
    await assert.rejects(
      () => service.updateMe({ id: USER_ID, username: 'kartik' }, { username: 'Bad Name' }),
      (error) => assertAppError(error, 422, 'USERNAME_INVALID'),
    );
  }

  {
    const service = new UsersService({}, config);
    await assert.rejects(
      () => service.updateMe(
        { id: USER_ID, username: 'kartik' },
        { image: 'https://cdn.example.test/avatars/someone-else/avatar.png' },
      ),
      (error) => assertAppError(error, 400, 'VALIDATION_ERROR'),
    );
  }

  {
    const service = new UsersService(
      { update: async () => { throw new UsernameConflictError(); } },
      config,
    );
    await assert.rejects(
      () => service.updateMe({ id: USER_ID, username: 'kartik' }, { username: 'taken_name' }),
      (error) => assertAppError(error, 409, 'USERNAME_TAKEN'),
    );
  }
});

test('UsersService publishes stable avatar identity and translates a cleanup-claim race', async () => {
  const publicBaseUrl = 'https://cdn.example.test/media/public';
  const publicUrl = `${publicBaseUrl}/avatars/${USER_ID}/avatar.png`;
  let updateData;
  const service = new UsersService(
    {
      update: async (_id, data) => {
        updateData = data;
        return userProfileRow({ image: publicUrl });
      },
    },
    { r2: { publicBaseUrl } },
  );

  await service.updateMe({ id: USER_ID, username: 'kartik' }, { image: publicUrl });
  assert.deepEqual(updateData.avatar, {
    publicUrl,
    objectKey: `avatars/${USER_ID}/avatar.png`,
  });

  const claimed = new UsersService(
    { update: async () => { throw new AvatarObjectUnavailableError(); } },
    { r2: { publicBaseUrl } },
  );
  await assert.rejects(
    () => claimed.updateMe({ id: USER_ID, username: 'kartik' }, { image: publicUrl }),
    (error) => assertAppError(error, 400, 'VALIDATION_ERROR'),
  );
});

test('UsersService returns self profiles with reputation and counts', async () => {
  const service = new UsersService(
    {
      findById: async () => userProfileRow({ followerCount: 7, followingCount: 2 }),
      counts: async () => assert.fail('profile counts must come from the profile query'),
    },
    { r2: { publicBaseUrl: 'https://cdn.example.test' } },
  );

  const profile = await service.getSelfProfile(USER_ID);

  assert.equal(profile.viewer.isSelf, true);
  assert.equal(profile.counts.followers, 7);
  assert.equal(profile.reputation.lsShared, 4);
});

test('FollowsService rejects self-follow and returns counts after follow', async () => {
  {
    const service = new FollowsService(
      {},
      {
        requireUserId: async () => USER_ID,
        getFollowCounts: async () => ({ followers: 0, following: 0 }),
      },
    );

    await assert.rejects(
      () => service.follow({ id: USER_ID, username: 'kartik' }, 'kartik'),
      (error) => assertAppError(error, 400, 'VALIDATION_ERROR'),
    );
  }

  {
    let followed = false;
    const service = new FollowsService(
      { follow: async () => { followed = true; } },
      {
        requireUserId: async () => OTHER_ID,
        getFollowCounts: async () => ({ followers: 3, following: 1 }),
      },
    );

    const result = await service.follow({ id: USER_ID, username: 'kartik' }, 'other');
    assert.equal(followed, true);
    assert.deepEqual(result, { isFollowing: true, counts: { followers: 3, following: 1 } });
  }
});

test('CollectionsService enforces owner-only collection mutations', async () => {
  {
    const service = new CollectionsService({}, {}, {});

    await assert.rejects(
      () => service.create({ id: USER_ID, username: null }, { title: 'Private notes' }),
      (error) => assertAppError(error, 403, 'FORBIDDEN'),
    );
  }

  {
    const service = new CollectionsService(
      { findOwner: async () => null },
      {},
      {},
    );

    await assert.rejects(
      () => service.rename({ id: USER_ID, username: 'kartik' }, COLLECTION_ID, { title: 'New' }),
      (error) => assertAppError(error, 404, 'COLLECTION_NOT_FOUND'),
    );
  }

  {
    const service = new CollectionsService(
      {
        findOwner: async () => ({ ownerId: USER_ID }),
        lOwner: async () => ({ authorId: OTHER_ID }),
      },
      {},
      {},
    );

    await assert.rejects(
      () => service.addL({ id: USER_ID, username: 'kartik' }, COLLECTION_ID, L_ID, {}),
      (error) => assertAppError(error, 403, 'FORBIDDEN'),
    );
  }
});

test('CollectionsService composes visible collection details', async () => {
  const service = new CollectionsService(
    {
      findById: async () => collectionRow(),
      orderedLIds: async () => [L_ID],
      visibleLs: async (_ids, visibilities, includeAnonymous) => {
        assert.deepEqual(visibilities, ['PUBLIC', 'FOLLOWERS', 'PRIVATE']);
        assert.equal(includeAnonymous, true);
        return [lRow()];
      },
      viewerReactions: async () => [],
    },
  );

  const detail = await service.getDetail(COLLECTION_ID, USER_ID);

  assert.equal(detail.viewer.canEdit, true);
  assert.equal(detail.ls.length, 1);
});

test('SearchService rejects malformed cursors before hitting repositories', async () => {
  const service = new SearchService({}, {});

  await assert.rejects(
    () => service.search({ q: 'kartik', type: 'users', limit: 10, cursor: encodeCursor({ id: USER_ID }) }, USER_ID),
    (error) => assertAppError(error, 400, 'BAD_CURSOR'),
  );

  await assert.rejects(
    () => service.search({ q: 'google', type: 'ls', limit: 10, cursor: encodeCursor({ offset: 1 }) }, USER_ID),
    (error) => assertAppError(error, 400, 'BAD_CURSOR'),
  );
});

test('SearchService paginates users with a username/id keyset cursor', async () => {
  const cursors = [];
  const service = new SearchService(
    {
      searchUsers: async (_q, limit, cursor) => {
        cursors.push(cursor);
        const rows = cursor
          ? [userSummary({ id: '01FRZ3NDEKTSV4RRFFQ69G5FAV', username: 'user_2' })]
          : [
              userSummary({ id: USER_ID, username: 'user_0' }),
              userSummary({ id: OTHER_ID, username: 'user_1' }),
              userSummary({ id: '01FRZ3NDEKTSV4RRFFQ69G5FAV', username: 'user_2' }),
            ];
        return rows.slice(0, limit);
      },
    },
    {},
  );

  const page = await service.search({ q: 'user', type: 'users', limit: 2 }, USER_ID);

  assert.equal(page.data.length, 2);
  assert.ok(page.nextCursor);
  assert.deepEqual(decodeCursor(page.nextCursor), { username: 'user_1', id: OTHER_ID });

  await service.search(
    { q: 'user', type: 'users', limit: 2, cursor: page.nextCursor },
    USER_ID,
  );
  assert.deepEqual(cursors, [null, { username: 'user_1', id: OTHER_ID }]);
});

test('UploadsService reports a stable error when avatar uploads are disabled', async () => {
  const service = new UploadsService({
    r2: {
      configured: false,
      endpoint: '',
      accessKeyId: '',
      secretAccessKey: '',
      bucket: '',
      publicBaseUrl: '',
    },
  });

  await assert.rejects(
    () => service.createAvatarUpload(USER_ID, { contentType: 'image/png', contentLength: 100 }),
    (error) => assertAppError(error, 503, 'UPLOADS_DISABLED'),
  );
});
