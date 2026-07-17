import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  paginationQuerySchema,
  type Comment,
  type CreateCommentInput,
  type Paginated,
  type PaginationQuery,
} from '@linkedout/contracts';

import { ApiContract, API_ROUTE_CONTRACTS } from '../../common/contracts/api-route-contracts';
import { API_ROUTE_CONTRACTS_V2 } from '../../common/contracts/api-route-contracts-v2';
import { CurrentUser, OptionalUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { StrictOptionalAuthGuard } from '../../common/guards/strict-optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { CommentsService } from './comments.service';

const bodyPipe = new ZodValidationPipe(API_ROUTE_CONTRACTS.commentCreateOnL.body.schema);
const listPipe = new ZodValidationPipe(paginationQuerySchema());

@Controller({ version: ['1', '2'] })
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('ls/:id/comments')
  @Version('1')
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.commentsForL)
  listForLV1(
    @OptionalUser() user: AuthUser | undefined,
    @Param('id') lId: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<Comment>> {
    return this.comments.listForL(lId, query, user?.id);
  }

  @Get('ls/:id/comments')
  @Version('2')
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.commentsForL)
  listForLV2(
    @OptionalUser() user: AuthUser | undefined,
    @Param('id') lId: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<Comment>> {
    return this.comments.listForL(lId, query, user?.id);
  }

  @Post('ls/:id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.commentCreateOnL)
  createOnL(
    @CurrentUser() user: AuthUser,
    @Param('id') lId: string,
    @Body(bodyPipe) body: CreateCommentInput,
  ): Promise<Comment> {
    return this.comments.createOnL(user, lId, body);
  }

  @Get('comments/:id/replies')
  @Version('1')
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.commentReplies)
  listRepliesV1(
    @OptionalUser() user: AuthUser | undefined,
    @Param('id') commentId: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<Comment>> {
    return this.comments.listReplies(commentId, query, user?.id);
  }

  @Get('comments/:id/replies')
  @Version('2')
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.commentReplies)
  listRepliesV2(
    @OptionalUser() user: AuthUser | undefined,
    @Param('id') commentId: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<Comment>> {
    return this.comments.listReplies(commentId, query, user?.id);
  }

  @Post('comments/:id/replies')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.commentCreateReply)
  createReply(
    @CurrentUser() user: AuthUser,
    @Param('id') commentId: string,
    @Body(bodyPipe) body: CreateCommentInput,
  ): Promise<Comment> {
    return this.comments.createReply(user, commentId, body);
  }

  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.commentDelete)
  remove(@CurrentUser() user: AuthUser, @Param('id') commentId: string): Promise<{ ok: true }> {
    return this.comments.remove(user, commentId);
  }
}
