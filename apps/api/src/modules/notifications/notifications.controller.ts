import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  paginationQuerySchema,
  type Notification,
  type Paginated,
  type PaginationQuery,
  type UnreadCount,
} from '@linkedout/contracts';

import { ApiContract, API_ROUTE_CONTRACTS } from '../../common/contracts/api-route-contracts';
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
  @ApiContract(API_ROUTE_CONTRACTS.notifications)
  list(
    @CurrentUser() user: AuthUser,
    @Query(listQueryPipe) query: PaginationQuery,
  ): Promise<Paginated<Notification>> {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  @ApiContract(API_ROUTE_CONTRACTS.notificationUnreadCount)
  unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCount> {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiContract(API_ROUTE_CONTRACTS.notificationsReadAll)
  markAllRead(@CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiContract(API_ROUTE_CONTRACTS.notificationRead)
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.notifications.markRead(id, user.id);
  }
}
