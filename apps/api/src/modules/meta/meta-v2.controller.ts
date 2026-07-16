import { Controller, Get, Header } from '@nestjs/common';
import type { MetaEnumsResponse } from '@linkedout/contracts/v2';

import { ApiContract } from '../../common/contracts/api-route-contracts';
import { API_ROUTE_CONTRACTS_V2 } from '../../common/contracts/api-route-contracts-v2';
import { MetaService } from './meta.service';
import type { OpenApiDocument } from './openapi';

const STATIC_METADATA_CACHE_CONTROL =
  'public, max-age=86400, stale-while-revalidate=604800';

@Controller({ version: '2' })
export class MetaV2Controller {
  constructor(private readonly meta: MetaService) {}

  @Get('openapi.json')
  @Header('Cache-Control', STATIC_METADATA_CACHE_CONTROL)
  @ApiContract(API_ROUTE_CONTRACTS_V2.openApi)
  openApi(): OpenApiDocument {
    return this.meta.getV2OpenApi();
  }

  @Get('meta/enums')
  @Header('Cache-Control', STATIC_METADATA_CACHE_CONTROL)
  @ApiContract(API_ROUTE_CONTRACTS_V2.metaEnums)
  enums(): MetaEnumsResponse {
    return this.meta.getEnumsV2();
  }
}
