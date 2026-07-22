-- Collections and the Journey timeline are retired in 1.1.4. The latter owned the
-- created-at author index; profile pagination continues to use L_authorId_id_idx.
DROP TABLE "CollectionL";
DROP TABLE "Collection";
ALTER TABLE "User" DROP COLUMN "collectionsCreated";
DROP INDEX "L_authorId_createdAt_idx";
