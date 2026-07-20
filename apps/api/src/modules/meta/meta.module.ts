import { Module } from '@nestjs/common';

import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';
import { HealthRepository } from './health.repository';

@Module({
  controllers: [MetaController],
  providers: [MetaService, HealthRepository],
})
export class MetaModule {}
