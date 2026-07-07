import { Controller, Get, Query } from '@nestjs/common';
import {
  popularTagsQuerySchema,
  type MetaEnumsResponse,
  type PopularTagsQuery,
  type PopularTagsResponse,
} from '@linkedout/contracts';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MetaService } from './meta.service';

const tagsQueryPipe = new ZodValidationPipe(popularTagsQuerySchema);

@Controller()
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  @Get('meta/enums')
  enums(): MetaEnumsResponse {
    return this.meta.getEnums();
  }

  @Get('tags/popular')
  popularTags(@Query(tagsQueryPipe) query: PopularTagsQuery): Promise<PopularTagsResponse> {
    return this.meta.popularTags(query);
  }
}
