import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createPrismaClient, type ExtendedPrismaClient } from '@linkedout/db';

/**
 * Owns the single extended Prisma client (ULID ids). Repositories access the DB
 * exclusively through `this.prisma.db`.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly db: ExtendedPrismaClient;

  constructor() {
    this.db = createPrismaClient();
  }

  async onModuleInit(): Promise<void> {
    await this.db.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}
