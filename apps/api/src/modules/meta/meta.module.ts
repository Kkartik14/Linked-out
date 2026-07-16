import { Module } from '@nestjs/common';

import { MetaController } from './meta.controller';
import { MetaV2Controller } from './meta-v2.controller';
import { MetaRepository } from './meta.repository';
import { MetaService } from './meta.service';

@Module({
  controllers: [MetaController, MetaV2Controller],
  providers: [MetaRepository, MetaService],
})
export class MetaModule {}
