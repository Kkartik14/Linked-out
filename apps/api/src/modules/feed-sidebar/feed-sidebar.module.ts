import { Module } from '@nestjs/common';

import { FeedSidebarController } from './feed-sidebar.controller';
import { FeedSidebarRepository } from './feed-sidebar.repository';
import { FeedSidebarService } from './feed-sidebar.service';

@Module({
  controllers: [FeedSidebarController],
  providers: [FeedSidebarRepository, FeedSidebarService],
})
export class FeedSidebarModule {}
