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
} from '@nestjs/common';
import {
  addLToCollectionInputSchema,
  createCollectionInputSchema,
  paginationQuerySchema,
  updateCollectionInputSchema,
  type AddLToCollectionInput,
  type Collection,
  type CollectionDetail,
  type CreateCollectionInput,
  type Paginated,
  type PaginationQuery,
  type UpdateCollectionInput,
} from '@linkedout/contracts';

import { CurrentUser, OptionalUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { CollectionsService } from './collections.service';

const createPipe = new ZodValidationPipe(createCollectionInputSchema);
const updatePipe = new ZodValidationPipe(updateCollectionInputSchema);
const addPipe = new ZodValidationPipe(addLToCollectionInputSchema);
const listPipe = new ZodValidationPipe(paginationQuerySchema());

@Controller()
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Post('collections')
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthUser,
    @Body(createPipe) body: CreateCollectionInput,
  ): Promise<Collection> {
    return this.collections.create(user, body);
  }

  @Get('collections/:id')
  @UseGuards(OptionalAuthGuard)
  detail(
    @OptionalUser() user: AuthUser | undefined,
    @Param('id') id: string,
  ): Promise<CollectionDetail> {
    return this.collections.getDetail(id, user?.id);
  }

  @Patch('collections/:id')
  @UseGuards(JwtAuthGuard)
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(updatePipe) body: UpdateCollectionInput,
  ): Promise<Collection> {
    return this.collections.rename(user, id, body);
  }

  @Delete('collections/:id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.collections.remove(user, id);
  }

  @Put('collections/:id/ls/:lId')
  @UseGuards(JwtAuthGuard)
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
  removeL(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lId') lId: string,
  ): Promise<CollectionDetail> {
    return this.collections.removeL(user, id, lId);
  }

  @Get('users/:username/collections')
  @UseGuards(OptionalAuthGuard)
  listByOwner(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username') username: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<Collection>> {
    return this.collections.listByOwner(username, query, user?.id);
  }
}
