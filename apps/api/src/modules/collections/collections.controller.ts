import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  paginationQuerySchema,
  type AddLToCollectionInput,
  type Collection,
  type CollectionDetail,
  type CreateCollectionInput,
  type Paginated,
  type PaginationQuery,
  type UpdateCollectionInput,
} from '@linkedout/contracts';

import { ApiContract, API_ROUTE_CONTRACTS } from '../../common/contracts/api-route-contracts';
import { API_ROUTE_CONTRACTS_V2 } from '../../common/contracts/api-route-contracts-v2';
import { CurrentUser, OptionalUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { StrictOptionalAuthGuard } from '../../common/guards/strict-optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { CollectionsService } from './collections.service';

const createPipe = new ZodValidationPipe(API_ROUTE_CONTRACTS.collectionCreate.body.schema);
const updatePipe = new ZodValidationPipe(API_ROUTE_CONTRACTS.collectionUpdate.body.schema);
const addPipe = new ZodValidationPipe(API_ROUTE_CONTRACTS.collectionAddL.body.schema);
const listPipe = new ZodValidationPipe(paginationQuerySchema());

@Controller()
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Post('collections')
  @Version(['1', '2'])
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.collectionCreate)
  create(
    @CurrentUser() user: AuthUser,
    @Body(createPipe) body: CreateCollectionInput,
  ): Promise<Collection> {
    return this.collections.create(user, body);
  }

  @Get('collections/:id')
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.collectionDetail)
  detail(
    @OptionalUser() user: AuthUser | undefined,
    @Param('id') id: string,
  ): Promise<CollectionDetail> {
    return this.collections.getDetail(id, user?.id);
  }

  @Patch('collections/:id')
  @Version(['1', '2'])
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.collectionUpdate)
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(updatePipe) body: UpdateCollectionInput,
  ): Promise<Collection> {
    return this.collections.rename(user, id, body);
  }

  @Delete('collections/:id')
  @Version(['1', '2'])
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.collectionDelete)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.collections.remove(user, id);
  }

  @Put('collections/:id/ls/:lId')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.collectionAddL)
  addL(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lId') lId: string,
    @Body(addPipe) body: AddLToCollectionInput,
  ): Promise<CollectionDetail> {
    return this.collections.addL(user, id, lId, body);
  }

  @Delete('collections/:id/ls/:lId')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.collectionRemoveL)
  removeL(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lId') lId: string,
  ): Promise<CollectionDetail> {
    return this.collections.removeL(user, id, lId);
  }

  @Get('users/:username/collections')
  @Version('1')
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.userCollections)
  listByOwnerV1(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username') username: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<Collection>> {
    return this.collections.listByOwner(username, query, user?.id);
  }

  @Get('users/:username/collections')
  @Version('2')
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.userCollections)
  listByOwnerV2(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username') username: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<Collection>> {
    return this.collections.listByOwner(username, query, user?.id);
  }
}
