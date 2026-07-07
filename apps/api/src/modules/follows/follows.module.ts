import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { FollowsController } from './follows.controller';
import { FollowsRepository } from './follows.repository';
import { FollowsService } from './follows.service';

@Module({
  imports: [UsersModule],
  controllers: [FollowsController],
  providers: [FollowsRepository, FollowsService],
})
export class FollowsModule {}
