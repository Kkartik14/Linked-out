import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { TokenService } from './token.service';

/**
 * Owns access/refresh token issuance as a small shared interface. Auth creates sessions,
 * while profile updates can refresh the username-bearing access principal without making
 * UsersModule depend on the rest of AuthModule.
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}
