import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { toDownloadUrls } from '../../common/utils/image-key';

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);

  /**
   * Tải ảnh tham khảo từ URL (Google Drive, Cloud...) + resize nhỏ lại để gửi cho AI.
   * Tự động thử lần lượt link trực tiếp (lh3) rồi fallback sang Google Drive Thumbnail
   * để xử lý cả ảnh gốc định dạng HEIC/TIFF hoặc trang HTML preview của Google Drive.
   */
  async fetchAndOptimize(
    rawUrl: string,
    options: { size?: number; quality?: number } = {},
  ): Promise<string | null> {
    const size = options.size ?? 256;
    const quality = options.quality ?? 60;
    const candidateUrls = toDownloadUrls(rawUrl);
    let lastError: unknown = null;

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          continue;
        }
        const contentType = res.headers.get('content-type') ?? '';
        if (contentType && !contentType.startsWith('image/')) {
          lastError = `Non-image content-type: ${contentType}`;
          continue;
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = await sharp(Buffer.from(arrayBuffer))
          .resize(size, size, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality })
          .toBuffer();

        return buffer.toString('base64');
      } catch (err) {
        lastError = err;
      }
    }

    this.logger.warn(
      `Failed to fetch/optimize ref image after ${candidateUrls.length} URL(s): ${rawUrl} (${
        lastError instanceof Error ? lastError.message : String(lastError)
      })`,
    );
    return null;
  }
}
