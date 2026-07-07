import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createLInputSchema,
  paginationQuerySchema,
  updateLInputSchema,
  type CreateLInput,
  type LCard,
  type LDetail,
  type Paginated,
  type PaginationQuery,
  type UpdateLInput,
} from '@linkedout/contracts';

import { CurrentUser, OptionalUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { LsService } from './ls.service';

const createPipe = new ZodValidationPipe(createLInputSchema);
const updatePipe = new ZodValidationPipe(updateLInputSchema);
const savedQueryPipe = new ZodValidationPipe(paginationQuerySchema());

@Controller()
export class LsController {
  constructor(private readonly ls: LsService) {}

  @Post('ls')
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthUser,
    @Body(createPipe) body: CreateLInput,
  ): Promise<LDetail> {
    return this.ls.create(user, body);
  }

  @Get('ls/:id')
  @UseGuards(OptionalAuthGuard)
  detail(@OptionalUser() user: AuthUser | undefined, @Param('id') id: string): Promise<LDetail> {
    return this.ls.getDetail(id, user?.id);
  }

  @Patch('ls/:id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(updatePipe) body: UpdateLInput,
  ): Promise<LDetail> {
    return this.ls.update(user, id, body);
  }

  @Delete('ls/:id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.ls.remove(user, id);
  }

  @Get('me/saved')
  @UseGuards(JwtAuthGuard)
  saved(
    @CurrentUser() user: AuthUser,
    @Query(savedQueryPipe) query: PaginationQuery,
  ): Promise<Paginated<LCard>> {
    return this.ls.getSaved(user.id, query);
  }
}
