import { Controller, Delete, Param, Put, UseGuards } from '@nestjs/common';
import { reactionTypeSchema, type ReactionResult, type ReactionType } from '@linkedout/contracts';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { ReactionsService } from './reactions.service';

const reactionTypePipe = new ZodValidationPipe(reactionTypeSchema);

@Controller('ls/:id/reactions')
@UseGuards(JwtAuthGuard)
export class ReactionsController {
  constructor(private readonly reactions: ReactionsService) {}

  @Put(':type')
  react(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('type', reactionTypePipe) type: ReactionType,
  ): Promise<ReactionResult> {
    return this.reactions.react(user, id, type);
  }

  @Delete(':type')
  unreact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('type', reactionTypePipe) type: ReactionType,
  ): Promise<ReactionResult> {
    return this.reactions.unreact(user, id, type);
  }
}
