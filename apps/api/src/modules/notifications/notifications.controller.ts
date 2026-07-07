import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  paginationQuerySchema,
  type Notification,
  type Paginated,
  type PaginationQuery,
  type UnreadCount,
} from '@linkedout/contracts';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { NotificationsService } from './notifications.service';

const listQueryPipe = new ZodValidationPipe(paginationQuerySchema());

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(listQueryPipe) query: PaginationQuery,
  ): Promise<Paginated<Notification>> {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCount> {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(200)
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.notifications.markRead(id, user.id);
  }
}
