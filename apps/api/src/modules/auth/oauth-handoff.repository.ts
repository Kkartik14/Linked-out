import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';

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
}
