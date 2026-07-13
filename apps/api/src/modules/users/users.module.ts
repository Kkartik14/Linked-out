import { Module } from '@nestjs/common';

import { TokenModule } from '../auth/token.module';
import { LsModule } from '../ls/ls.module';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [LsModule, TokenModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
