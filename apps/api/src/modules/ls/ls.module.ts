import { Module } from '@nestjs/common';

import { LsController } from './ls.controller';
import { LsRepository } from './ls.repository';
import { LsService } from './ls.service';
import { LsV2Reader } from './ls-v2.reader';

@Module({
  controllers: [LsController],
  providers: [LsRepository, LsService, LsV2Reader],
  exports: [LsService, LsV2Reader],
})
export class LsModule {}
