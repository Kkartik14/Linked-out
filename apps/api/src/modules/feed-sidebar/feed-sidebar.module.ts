import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { LsModule } from '../ls/ls.module';
import { FeedSidebarController } from './feed-sidebar.controller';
import { FeedSidebarRepository } from './feed-sidebar.repository';
import { FeedSidebarService } from './feed-sidebar.service';

@Module({
  imports: [LsModule, UsersModule],
  controllers: [FeedSidebarController],
  providers: [FeedSidebarRepository, FeedSidebarService],
})
export class FeedSidebarModule {}
