import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  popularTagsQuerySchema,
  type MetaEnumsResponse,
  type PopularTagsQuery,
  type PopularTagsResponse,
} from '@linkedout/contracts';

import { ApiContract, API_ROUTE_CONTRACTS } from '../../common/contracts/api-route-contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MetaService } from './meta.service';
import type { OpenApiDocument } from './openapi';

const tagsQueryPipe = new ZodValidationPipe(popularTagsQuerySchema);
const STATIC_METADATA_CACHE_CONTROL =
  'public, max-age=86400, stale-while-revalidate=604800';

@Controller()
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  @Get('meta/enums')
  @Header('Cache-Control', STATIC_METADATA_CACHE_CONTROL)
  @ApiContract(API_ROUTE_CONTRACTS.metaEnums)
  enums(): MetaEnumsResponse {
    return this.meta.getEnums();
  }

  @Get('openapi.json')
  @Header('Cache-Control', STATIC_METADATA_CACHE_CONTROL)
  @ApiContract(API_ROUTE_CONTRACTS.openApi)
  openApi(): OpenApiDocument {
    return this.meta.getOpenApi();
  }

  @Get('tags/popular')
  @ApiContract(API_ROUTE_CONTRACTS.popularTags)
  popularTags(@Query(tagsQueryPipe) query: PopularTagsQuery): Promise<PopularTagsResponse> {
    return this.meta.popularTags(query);
  }
}
