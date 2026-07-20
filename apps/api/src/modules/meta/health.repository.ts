import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';

/** Minimal operational probes behind the normal persistence seam. */
@Injectable()
export class HealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assertDatabaseAvailable(): Promise<void> {
    await this.prisma.db.$queryRaw(Prisma.sql`SELECT 1`);
  }

  async assertSessionAuthorityAvailable(): Promise<void> {
    await this.prisma.db.browserSession.findFirst({ select: { id: true } });
  }
}
