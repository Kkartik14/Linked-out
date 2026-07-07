import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createCommentInputSchema,
  paginationQuerySchema,
  type Comment,
  type CreateCommentInput,
  type Paginated,
  type PaginationQuery,
} from '@linkedout/contracts';

import { CurrentUser, OptionalUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { CommentsService } from './comments.service';

const bodyPipe = new ZodValidationPipe(createCommentInputSchema);
const listPipe = new ZodValidationPipe(paginationQuerySchema());

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('ls/:id/comments')
  @UseGuards(OptionalAuthGuard)
  listForL(
    @OptionalUser() user: AuthUser | undefined,
    @Param('id') lId: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<Comment>> {
    return this.comments.listForL(lId, query, user?.id);
  }

  @Post('ls/:id/comments')
  @UseGuards(JwtAuthGuard)
  createOnL(
    @CurrentUser() user: AuthUser,
    @Param('id') lId: string,
    @Body(bodyPipe) body: CreateCommentInput,
  ): Promise<Comment> {
    return this.comments.createOnL(user, lId, body);
  }

  @Get('comments/:id/replies')
  @UseGuards(OptionalAuthGuard)
  listReplies(
    @OptionalUser() user: AuthUser | undefined,
    @Param('id') commentId: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<Comment>> {
    return this.comments.listReplies(commentId, query, user?.id);
  }

  @Post('comments/:id/replies')
  @UseGuards(JwtAuthGuard)
  createReply(
    @CurrentUser() user: AuthUser,
    @Param('id') commentId: string,
    @Body(bodyPipe) body: CreateCommentInput,
  ): Promise<Comment> {
    return this.comments.createReply(user, commentId, body);
  }

  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: AuthUser, @Param('id') commentId: string): Promise<{ ok: true }> {
    return this.comments.remove(user, commentId);
  }
}
