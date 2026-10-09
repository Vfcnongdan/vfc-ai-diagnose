import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
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
  private driveClient: drive_v3.Drive | null = null;
  private isClientInitialized = false;

  constructor(private config: ConfigService) {}

  /**
   * Khởi tạo authenticated Google Drive client (Lazy-init, tái sử dụng kết nối)
   */
  private getDriveClient(): drive_v3.Drive | null {
    if (this.isClientInitialized) {
      return this.driveClient;
    }

    try {
      const enabled =
        this.config.get('ENABLE_GOOGLE_DRIVE_SYNC') !== 'false' &&
        this.config.get('enableGoogleDriveSync') !== false;

      if (!enabled) {
        this.logger.log('[GoogleDriveService] Google Drive Sync is disabled by configuration.');
        this.isClientInitialized = true;
        this.driveClient = null;
        return null;
      }

      // Hỗ trợ cả 3 cách truyền key:
      // 1. GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
      // 2. GOOGLE_SERVICE_ACCOUNT_JSON (toàn bộ nội dung JSON key)
      // 3. GOOGLE_APPLICATION_CREDENTIALS (đường dẫn tới file key.json)
      const rawJson = this.config.get('GOOGLE_SERVICE_ACCOUNT_JSON');
      let clientEmail =
        this.config.get('GOOGLE_SERVICE_ACCOUNT_EMAIL') ||
        this.config.get('googleServiceAccountEmail');
      let privateKey =
        this.config.get('GOOGLE_PRIVATE_KEY') ||
        this.config.get('googlePrivateKey');
      const keyFilePath =
        this.config.get('GOOGLE_APPLICATION_CREDENTIALS') ||
        this.config.get('googleApplicationCredentials');

      if (rawJson) {
        try {
          const parsed = JSON.parse(rawJson);
          clientEmail = clientEmail || parsed.client_email;
          privateKey = privateKey || parsed.private_key;
        } catch (e: any) {
          this.logger.warn(`[GoogleDriveService] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON: ${e.message}`);
        }
      }

      let auth;
      if (clientEmail && privateKey) {
        auth = new google.auth.JWT({
          email: clientEmail,
          key: privateKey.replace(/\\n/g, '\n'),
          scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
      } else if (keyFilePath) {
        auth = new google.auth.GoogleAuth({
          keyFile: keyFilePath,
          scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
      } else {
        this.logger.warn(
          '[GoogleDriveService] Google Service Account credentials not provided. Google Drive Sync will remain in standby mode until credentials are set.',
        );
        this.isClientInitialized = true;
        this.driveClient = null;
        return null;
      }

      this.driveClient = google.drive({ version: 'v3', auth });
      this.isClientInitialized = true;
      this.logger.log('[GoogleDriveService] Google Drive client successfully initialized.');
      return this.driveClient;
    } catch (err: any) {
      this.logger.error(`[GoogleDriveService] Failed to initialize Google Drive client: ${err.message}`);
      this.isClientInitialized = true;
      this.driveClient = null;
      return null;
    }
  }

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
   * Upload ca chẩn đoán có vấn đề lên thư mục Google Drive chuyên dụng
   */
  async uploadProblematicDiagnosis(
    params: ProblematicDiagnosisUploadParams,
  ): Promise<{ fileId: string; webViewLink?: string } | null> {
    const drive = this.getDriveClient();
    if (!drive) {
      this.logger.log(
        `[GoogleDriveService] Skipping Drive upload for ${params.diagnosisId} (Service Account not configured).`,
      );
      return null;
    }

    const folderId =
      this.config.get('GOOGLE_DRIVE_FOLDER_ID') ||
      this.config.get('googleDriveFolderId');

    if (!folderId) {
      this.logger.warn(
        `[GoogleDriveService] GOOGLE_DRIVE_FOLDER_ID is missing. Cannot upload ${params.diagnosisId}.`,
      );
      return null;
    }

    try {
      this.logger.log(
        `[GoogleDriveService] Uploading problematic diagnosis to Drive | ID: ${params.diagnosisId} | Case: ${params.caseType} | Disease: ${params.disease}`,
      );

      // 1. Chuyển base64 sang Buffer
      const cleanBase64 = params.base64Image.replace(
        /^data:image\/\w+;base64,/,
        '',
      );
      const rawBuffer = Buffer.from(cleanBase64, 'base64');

      // 2. Chèn banner thông tin vào ảnh
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

      // 3. Tạo tên file & metadata
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

      // 4. Gọi API Google Drive
      const res = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId],
          description,
          appProperties: {
            diagnosisId: params.diagnosisId,
            caseType: params.caseType,
            cropType: params.cropType || '',
            disease: params.disease,
            confidence: String(params.confidence || ''),
          },
        },
        media: {
          mimeType: 'image/jpeg',
          body: Readable.from(finalBuffer),
        },
        fields: 'id, name, webViewLink',
      });

      const fileId = res.data.id || '';
      const webViewLink = res.data.webViewLink || undefined;

      this.logger.log(
        `[GoogleDriveService] Successfully uploaded to Drive! File: ${fileName} | ID: ${fileId} | Link: ${webViewLink || 'N/A'}`,
      );

      return { fileId, webViewLink };
    } catch (err: any) {
      this.logger.error(
        `[GoogleDriveService] Drive upload failed for ${params.diagnosisId}: ${err.message}`,
        err.stack,
      );
      // Tuyệt đối không ném lỗi ra ngoài để bảo vệ tiến trình hệ thống
      return null;
    }
  }
}
