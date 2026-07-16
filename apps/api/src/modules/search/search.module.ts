import { Module } from '@nestjs/common';

import { SearchController } from './search.controller';
import { SearchV2Controller } from './search-v2.controller';
import { SearchRepository } from './search.repository';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController, SearchV2Controller],
  providers: [SearchRepository, SearchService],
})
export class SearchModule {}
