import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  ulidSchema,
  type AddLToCollectionInput,
  type CollectionDetail,
} from '@linkedout/contracts/v2';

import { ApiContract } from '../../common/contracts/api-route-contracts';
import { API_ROUTE_CONTRACTS_V2 } from '../../common/contracts/api-route-contracts-v2';
import { CurrentUser, OptionalUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StrictOptionalAuthGuard } from '../../common/guards/strict-optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { CollectionsService } from './collections.service';

const addPipe = new ZodValidationPipe(API_ROUTE_CONTRACTS_V2.collectionAddL.body.schema);
const idPipe = new ZodValidationPipe(ulidSchema);

@Controller({ version: '2' })
export class CollectionsV2Controller {
  constructor(private readonly collections: CollectionsService) {}

  @Get('collections/:id')
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.collectionDetail)
  detail(
    @OptionalUser() user: AuthUser | undefined,
    @Param('id', idPipe) id: string,
  ): Promise<CollectionDetail> {
    return this.collections.getDetailV2(id, user?.id);
  }

  @Put('collections/:id/ls/:lId')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.collectionAddL)
  addL(
    @CurrentUser() user: AuthUser,
    @Param('id', idPipe) id: string,
    @Param('lId', idPipe) lId: string,
    @Body(addPipe) body: AddLToCollectionInput,
  ): Promise<CollectionDetail> {
    return this.collections.addLV2(user, id, lId, body);
  }

  @Delete('collections/:id/ls/:lId')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.collectionRemoveL)
  removeL(
    @CurrentUser() user: AuthUser,
    @Param('id', idPipe) id: string,
    @Param('lId', idPipe) lId: string,
  ): Promise<CollectionDetail> {
    return this.collections.removeLV2(user, id, lId);
  }
}
