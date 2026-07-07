import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { AppConfigService } from './app-config.service';

@Global()
@Module({
  imports: [NestConfigModule.forRoot({ isGlobal: true, cache: true })],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModule {}
