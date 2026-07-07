import { Module } from '@nestjs/common';

import { LsModule } from '../ls/ls.module';
import { ReactionsController } from './reactions.controller';
import { ReactionsRepository } from './reactions.repository';
import { ReactionsService } from './reactions.service';

@Module({
  imports: [LsModule],
  controllers: [ReactionsController],
  providers: [ReactionsRepository, ReactionsService],
})
export class ReactionsModule {}
