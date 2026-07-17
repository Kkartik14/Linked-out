import { Module } from '@nestjs/common';

import { LsController } from './ls.controller';
import { LsV2Controller } from './ls-v2.controller';
import { LsRepository } from './ls.repository';
import { LsService } from './ls.service';

@Module({
  controllers: [LsController, LsV2Controller],
  providers: [LsRepository, LsService],
  exports: [LsService],
})
export class LsModule {}
