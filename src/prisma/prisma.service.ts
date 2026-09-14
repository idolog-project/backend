import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    if (this.shouldSkipConnection()) return;
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.shouldSkipConnection()) return;
    await this.$disconnect();
  }

  private shouldSkipConnection(): boolean {
    return this.configService.get<boolean>('RECOMMENDATION_STANDALONE_ENABLED', false);
  }
}
