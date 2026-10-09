import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';

import { getRedisConnectionOptions } from './config/redis.config';
import { aiConfig } from './config/ai.config';
import { googleDriveConfig } from './config/google-drive.config';
import { SecurityModule } from './common/security/security.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { DiagnosisModule } from './modules/diagnosis/diagnosis.module';
import { AIModule } from './modules/ai/ai.module';
import { ImageModule } from './modules/image/image.module';
import { StorageModule } from './modules/storage/storage.module';
import { HealthModule } from './modules/health/health.module';
import { GoogleDriveModule } from './modules/google-drive/google-drive.module';

@Module({
  imports: [
    // Global environment config with custom typed loaders
    ConfigModule.forRoot({
      isGlobal: true,
      load: [aiConfig, googleDriveConfig],
    }),

    // Structured logging with Pino
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),

    // Redis connection for BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        connection: getRedisConnectionOptions(),
      }),
    }),

    // Core Security & Throttling Module
    SecurityModule,

    // Business & Core Modules
    PrismaModule,
    DiagnosisModule,
    AIModule,
    ImageModule,
    StorageModule,
    HealthModule,
    GoogleDriveModule,
  ],
})
export class AppModule {}
