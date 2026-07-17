import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';

export interface ConsumedOAuthHandoff {
  sub: string;
  returnTo: string;
}

@Injectable()
export class OAuthHandoffRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    codeHash: string;
    sub: string;
    returnTo: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<boolean> {
    try {
      await this.prisma.db.oAuthHandoff.create({
        data: input,
        select: { id: true },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async consume(codeHash: string): Promise<ConsumedOAuthHandoff | null> {
    const rows = await this.prisma.db.$queryRaw<ConsumedOAuthHandoff[]>(Prisma.sql`
      UPDATE "OAuthHandoff"
      SET "consumedAt" = CURRENT_TIMESTAMP
      WHERE "codeHash" = ${codeHash}
        AND "consumedAt" IS NULL
        AND CURRENT_TIMESTAMP < "expiresAt"
      RETURNING "sub", "returnTo"
    `);
    return rows[0] ?? null;
  }
}
