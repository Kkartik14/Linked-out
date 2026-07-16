import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  paginationQuerySchema,
  type CreateLInput,
  type LCard,
  type LDetail,
  type Paginated,
  type PaginationQuery,
  type UpdateLInput,
} from '@linkedout/contracts/v2';

import { ApiContract } from '../../common/contracts/api-route-contracts';
import { API_ROUTE_CONTRACTS_V2 } from '../../common/contracts/api-route-contracts-v2';
import { CurrentUser, OptionalUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StrictOptionalAuthGuard } from '../../common/guards/strict-optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { LsService } from './ls.service';

const createPipe = new ZodValidationPipe(API_ROUTE_CONTRACTS_V2.lCreate.body.schema);
const updatePipe = new ZodValidationPipe(API_ROUTE_CONTRACTS_V2.lUpdate.body.schema);
const savedQueryPipe = new ZodValidationPipe(paginationQuerySchema());

@Controller({ version: '2' })
export class LsV2Controller {
  constructor(private readonly ls: LsService) {}

  @Post('ls')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.lCreate)
  create(@CurrentUser() user: AuthUser, @Body(createPipe) body: CreateLInput): Promise<LDetail> {
    return this.ls.createV2(user, body);
  }

  @Get('ls/:id')
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.lDetail)
  detail(@OptionalUser() user: AuthUser | undefined, @Param('id') id: string): Promise<LDetail> {
    return this.ls.getDetailV2(id, user?.id);
  }

  @Patch('ls/:id')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.lUpdate)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(updatePipe) body: UpdateLInput,
  ): Promise<LDetail> {
    return this.ls.updateV2(user, id, body);
  }

  @Delete('ls/:id')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.lDelete)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.ls.remove(user, id);
  }

  @Get('me/saved')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.savedLs)
  saved(
    @CurrentUser() user: AuthUser,
    @Query(savedQueryPipe) query: PaginationQuery,
  ): Promise<Paginated<LCard>> {
    return this.ls.getSavedV2(user.id, query);
  }
}
