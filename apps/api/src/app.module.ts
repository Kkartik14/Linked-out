import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LsModule } from './modules/ls/ls.module';
import { FeedModule } from './modules/feed/feed.module';
import { ReactionsModule } from './modules/reactions/reactions.module';
import { CommentsModule } from './modules/comments/comments.module';
import { FollowsModule } from './modules/follows/follows.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SearchModule } from './modules/search/search.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { MetaModule } from './modules/meta/meta.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    LsModule,
    FeedModule,
    ReactionsModule,
    CommentsModule,
    FollowsModule,
    CollectionsModule,
    NotificationsModule,
    SearchModule,
    UploadsModule,
    MetaModule,
  ],
})
export class AppModule {}
