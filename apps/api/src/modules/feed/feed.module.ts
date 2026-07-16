import { Module } from '@nestjs/common';

import { LsModule } from '../ls/ls.module';
import { FeedController } from './feed.controller';
import { FeedV2Controller } from './feed-v2.controller';

@Module({
  imports: [LsModule],
  controllers: [FeedController, FeedV2Controller],
})
export class FeedModule {}
