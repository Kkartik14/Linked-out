import { Module } from '@nestjs/common';

import { TokenModule } from '../auth/token.module';
import { LsModule } from '../ls/ls.module';
import { UsersController } from './users.controller';
import { UsersV2Controller } from './users-v2.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [LsModule, TokenModule],
  controllers: [UsersController, UsersV2Controller],
  providers: [UsersRepository, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
