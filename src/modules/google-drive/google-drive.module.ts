import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GoogleDriveService } from './google-drive.service';
import { GoogleDriveProcessor } from './google-drive.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'google-drive-sync',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 86400,
          count: 500,
        },
        removeOnFail: {
          age: 604800,
        },
      },
    }),
  ],
  providers: [GoogleDriveService, GoogleDriveProcessor],
  exports: [GoogleDriveService, BullModule],
})
export class GoogleDriveModule {}
