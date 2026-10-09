import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeStr } from '../../common/utils/string';
import {
  attachDiagnosisBannerToImage,
  DiagnosisBannerParams,
} from '../../common/utils/diagnosis-image-banner';

export interface ProblematicDiagnosisUploadParams {
  diagnosisId: string;
  cropType?: string;
  growthStage?: string;
  disease: string;
  confidence?: number;
  caseType: 'NO_SOLUTION' | 'LOW_CONFIDENCE';
  summary?: string;
  base64Image: string;
}

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(private config: ConfigService) {}

  /**
   * Tạo tên file chuẩn hóa, nhìn lướt trên Google Drive là nhận diện ngay
   */
  generateFileName(params: ProblematicDiagnosisUploadParams): string {
    const toSlug = (s?: string) =>
      normalizeStr(s || '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'unknown';

    const cleanCrop = toSlug(params.cropType) || 'cay';
    const cleanDisease = toSlug(params.disease) || 'benh';

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const shortId = params.diagnosisId.slice(-8);

    if (params.caseType === 'NO_SOLUTION') {
      return `[NO_SOLUTION]_[${cleanCrop}]_[${cleanDisease}]_[${dateStr}]_[${shortId}].jpg`;
    } else {
      const confStr = Math.round((params.confidence || 0) * 100);
      return `[LOW_CONF_${confStr}%]_[${cleanCrop}]_[${cleanDisease}]_[${dateStr}]_[${shortId}].jpg`;
    }
  }

  /**
   * Đồng bộ ca chẩn đoán có vấn đề lên Google Drive thông qua Google Apps Script Webhook.
   * Chạy dưới quyền tài khoản Google cá nhân của người dùng, sử dụng 15GB miễn phí mà không bị lỗi Service Account Quota.
   */
  async uploadProblematicDiagnosis(
    params: ProblematicDiagnosisUploadParams,
  ): Promise<{ fileId: string; webViewLink?: string } | null> {
    const enabled =
      this.config.get('ENABLE_GOOGLE_DRIVE_SYNC') !== 'false' &&
      this.config.get('enableGoogleDriveSync') !== false;

    if (!enabled) {
      this.logger.log(
        '[GoogleDriveService] Google Drive Sync is disabled by configuration.',
      );
      return null;
    }

    const webhookUrl =
      this.config.get('GOOGLE_DRIVE_WEBHOOK_URL') ||
      this.config.get('googleDriveWebhookUrl');

    const folderId =
      this.config.get('GOOGLE_DRIVE_FOLDER_ID') ||
      this.config.get('googleDriveFolderId');

    if (!webhookUrl) {
      this.logger.log(
        `[GoogleDriveService] GOOGLE_DRIVE_WEBHOOK_URL not configured. Skipping Drive sync for ${params.diagnosisId}.`,
      );
      return null;
    }

    try {
      this.logger.log(
        `[GoogleDriveService] Uploading problematic diagnosis via Webhook | ID: ${params.diagnosisId} | Case: ${params.caseType} | Disease: ${params.disease}`,
      );

      // 1. Chuyển base64 sang Buffer
      const cleanBase64 = params.base64Image.replace(
        /^data:image\/\w+;base64,/,
        '',
      );
      const rawBuffer = Buffer.from(cleanBase64, 'base64');

      // 2. Chèn banner thông tin lâm sàng vào ảnh
      const bannerParams: DiagnosisBannerParams = {
        cropType: params.cropType,
        growthStage: params.growthStage,
        disease: params.disease,
        confidence: params.confidence,
        caseType: params.caseType,
        diagnosisId: params.diagnosisId,
        summary: params.summary,
      };
      const finalBuffer = await attachDiagnosisBannerToImage(
        rawBuffer,
        bannerParams,
      );

      // 3. Tạo tên file & mô tả chi tiết
      const fileName = this.generateFileName(params);
      const description = [
        `=== CA CHẨN ĐOÁN CẦN THẨM ĐỊNH (${params.caseType}) ===`,
        `- Mã chẩn đoán: ${params.diagnosisId}`,
        `- Loại cây: ${params.cropType || 'Chưa rõ'}`,
        `- Giai đoạn: ${params.growthStage || 'Chưa rõ'}`,
        `- Bệnh nhận diện: ${params.disease}`,
        `- Độ tin cậy: ${params.confidence ? `${Math.round(params.confidence * 100)}%` : 'Chưa rõ'}`,
        `- Lý do: ${params.caseType === 'NO_SOLUTION' ? 'Không tìm thấy thuốc/phác đồ VFC trong danh mục' : 'Độ tin cậy của mô hình < 60%'}`,
        `- Tóm tắt AI: ${params.summary || 'N/A'}`,
        `- Thời gian: ${new Date().toISOString()}`,
      ].join('\n');

      // 4. Bắn HTTP POST sang Google Apps Script Webhook
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: folderId || '',
          fileName,
          description,
          base64Image: finalBuffer.toString('base64'),
          diagnosisId: params.diagnosisId,
          caseType: params.caseType,
          cropType: params.cropType,
          disease: params.disease,
          confidence: params.confidence,
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!response.ok) {
        throw new Error(
          `Webhook responded with HTTP status ${response.status} (${response.statusText})`,
        );
      }

      const data = (await response.json().catch(() => ({}))) as any;

      if (data.status === 'success' || data.fileId) {
        this.logger.log(
          `[GoogleDriveService] Successfully uploaded to Drive via Webhook! File: ${fileName} | ID: ${data.fileId || 'N/A'} | Link: ${data.webViewLink || 'N/A'}`,
        );
        return {
          fileId: data.fileId || '',
          webViewLink: data.webViewLink || undefined,
        };
      } else {
        this.logger.warn(
          `[GoogleDriveService] Webhook upload failed for ${params.diagnosisId}: ${data.message || JSON.stringify(data)}`,
        );
        return null;
      }
    } catch (err: any) {
      this.logger.error(
        `[GoogleDriveService] Drive Webhook upload error for ${params.diagnosisId}: ${err.message}`,
        err.stack,
      );
      return null;
    }
  }
}
