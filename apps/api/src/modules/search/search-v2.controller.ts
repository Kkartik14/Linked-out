import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { searchQuerySchema, type SearchQuery } from '@linkedout/contracts/v2';

import { ApiContract } from '../../common/contracts/api-route-contracts';
import { API_ROUTE_CONTRACTS_V2 } from '../../common/contracts/api-route-contracts-v2';
import { OptionalUser } from '../../common/decorators/current-user.decorator';
import { StrictOptionalAuthGuard } from '../../common/guards/strict-optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { SearchService, type SearchResultV2 } from './search.service';

const searchQueryPipe = new ZodValidationPipe(searchQuerySchema);

@Controller({ path: 'search', version: '2' })
export class SearchV2Controller {
  constructor(private readonly search: SearchService) {}

  @Get()
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.search)
  run(
    @OptionalUser() user: AuthUser | undefined,
    @Query(searchQueryPipe) query: SearchQuery,
  ): Promise<SearchResultV2> {
    return this.search.searchV2(query, user?.id);
  }
}
