import { Module } from '@nestjs/common';

import { LsController } from './ls.controller';
import { LsRepository } from './ls.repository';
import { LsService } from './ls.service';

@Module({
  controllers: [LsController],
  providers: [LsRepository, LsService],
  exports: [LsService, LsRepository],
})
export class LsModule {}
