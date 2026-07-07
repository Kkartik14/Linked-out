import { Module } from '@nestjs/common';

import { LsModule } from '../ls/ls.module';
import { CommentsController } from './comments.controller';
import { CommentsRepository } from './comments.repository';
import { CommentsService } from './comments.service';

@Module({
  imports: [LsModule],
  controllers: [CommentsController],
  providers: [CommentsRepository, CommentsService],
})
export class CommentsModule {}
