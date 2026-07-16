import { Module } from '@nestjs/common';

import { FeedSidebarController } from './feed-sidebar.controller';
import { FeedSidebarService } from './feed-sidebar.service';

@Module({
  controllers: [FeedSidebarController],
  providers: [FeedSidebarService],
})
export class FeedSidebarModule {}
