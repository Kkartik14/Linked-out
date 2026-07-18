import { Module } from '@nestjs/common';

import { LsModule } from '../ls/ls.module';
import { FeedController } from './feed.controller';

@Module({
  imports: [LsModule],
  controllers: [FeedController],
})
export class FeedModule {}
