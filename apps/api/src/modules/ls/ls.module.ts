import { Module } from '@nestjs/common';

import { LsController } from './ls.controller';
import { LsV2Controller } from './ls-v2.controller';
import { LsRepository } from './ls.repository';
import { LsService } from './ls.service';
import { LsV2Reader } from './ls-v2.reader';

@Module({
  controllers: [LsController, LsV2Controller],
  providers: [LsRepository, LsService, LsV2Reader],
  exports: [LsService, LsV2Reader],
})
export class LsModule {}
