import { Module } from '@nestjs/common';

import { LsModule } from '../ls/ls.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommentsController } from './comments.controller';
import { CommentsRepository } from './comments.repository';
import { CommentsService } from './comments.service';

@Module({
  imports: [LsModule, NotificationsModule],
  controllers: [CommentsController],
  providers: [CommentsRepository, CommentsService],
})
export class CommentsModule {}
