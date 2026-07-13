import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RateLimitInterceptor } from './common/interceptors/rate-limit.interceptor';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { RateLimitRepository } from './common/rate-limit/rate-limit.repository';
import { RateLimiter } from './common/rate-limit/rate-limiter';
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
  providers: [
    RateLimitRepository,
    RateLimiter,
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RateLimitInterceptor },
  ],
})
export class AppModule {}
