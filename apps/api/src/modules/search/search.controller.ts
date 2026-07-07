import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { searchQuerySchema, type SearchQuery } from '@linkedout/contracts';

import { OptionalUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { SearchService, type SearchResult } from './search.service';

const searchQueryPipe = new ZodValidationPipe(searchQuerySchema);

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  run(
    @OptionalUser() user: AuthUser | undefined,
    @Query(searchQueryPipe) query: SearchQuery,
  ): Promise<SearchResult> {
    return this.search.search(query, user?.id);
  }
}
