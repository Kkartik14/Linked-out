import { Module } from '@nestjs/common';

import { LsModule } from '../ls/ls.module';
import { SearchController } from './search.controller';
import { SearchRepository } from './search.repository';
import { SearchService } from './search.service';

@Module({
  imports: [LsModule],
  controllers: [SearchController],
  providers: [SearchRepository, SearchService],
})
export class SearchModule {}
