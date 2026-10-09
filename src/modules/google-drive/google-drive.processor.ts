import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import {
  GoogleDriveService,
  ProblematicDiagnosisUploadParams,
} from './google-drive.service';

@Processor('google-drive-sync')
export class GoogleDriveProcessor extends WorkerHost {
  private readonly logger = new Logger(GoogleDriveProcessor.name);

  constructor(private googleDriveService: GoogleDriveService) {
    super();
  }

  async process(job: Job<ProblematicDiagnosisUploadParams>): Promise<void> {
    this.logger.log(
      `[GoogleDriveProcessor] Processing background upload job ${job.id} for diagnosis: ${job.data.diagnosisId} | Case: ${job.data.caseType}`,
    );

    try {
      const result = await this.googleDriveService.uploadProblematicDiagnosis(
        job.data,
      );

      if (result) {
        this.logger.log(
          `[GoogleDriveProcessor] Job ${job.id} complete. Drive File ID: ${result.fileId}`,
        );
      } else {
        this.logger.log(
          `[GoogleDriveProcessor] Job ${job.id} skipped or returned null.`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `[GoogleDriveProcessor] Failed to process job ${job.id} for ${job.data.diagnosisId}: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }
}
