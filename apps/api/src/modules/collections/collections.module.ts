import { Module } from '@nestjs/common';

import { LsModule } from '../ls/ls.module';
import { UsersModule } from '../users/users.module';
import { CollectionsController } from './collections.controller';
import { CollectionsV2Controller } from './collections-v2.controller';
import { CollectionsRepository } from './collections.repository';
import { CollectionsService } from './collections.service';

@Module({
  imports: [LsModule, UsersModule],
  controllers: [CollectionsController, CollectionsV2Controller],
  providers: [CollectionsRepository, CollectionsService],
})
export class CollectionsModule {}
