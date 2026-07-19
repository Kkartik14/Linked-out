import { Controller, Get, Header } from '@nestjs/common';
import type { MetaEnumsResponse } from '@linkedout/contracts';

import { ApiContract, API_ROUTE_CONTRACTS } from '../../common/contracts/api-route-contracts';
import { MetaService } from './meta.service';
import type { OpenApiDocument } from './openapi';

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
}
