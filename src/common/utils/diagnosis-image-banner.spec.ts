import sharp from 'sharp';
import {
  attachDiagnosisBannerToImage,
  DiagnosisBannerParams,
} from './diagnosis-image-banner';

describe('DiagnosisImageBanner', () => {
  let sampleImageBuffer: Buffer;

  beforeAll(async () => {
    // Tạo 1 ảnh JPEG 300x300 màu xanh lá đơn giản để test
    sampleImageBuffer = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: { r: 34, g: 197, b: 94 },
      },
    })
      .jpeg()
      .toBuffer();
  });

  it('should successfully append banner for NO_SOLUTION case', async () => {
    const params: DiagnosisBannerParams = {
      cropType: 'Lúa',
      growthStage: 'Đẻ nhánh',
      disease: 'Bệnh đạo ôn lá',
      caseType: 'NO_SOLUTION',
      diagnosisId: 'test-diag-001',
      summary: 'Không có thuốc VFC phù hợp',
    };

    const outputBuffer = await attachDiagnosisBannerToImage(
      sampleImageBuffer,
      params,
    );

    expect(outputBuffer).toBeDefined();
    expect(outputBuffer.length).toBeGreaterThan(0);

    const meta = await sharp(outputBuffer).metadata();
    expect(meta.width).toBe(300);
    // Height phải tăng thêm 140px banner
    expect(meta.height).toBe(300 + 140);
  });

  it('should successfully append banner for LOW_CONFIDENCE case', async () => {
    const params: DiagnosisBannerParams = {
      cropType: 'Sầu riêng',
      growthStage: 'Phát triển đọt non',
      disease: 'Cháy lá chết ngọn',
      confidence: 0.45,
      caseType: 'LOW_CONFIDENCE',
      diagnosisId: 'test-diag-002',
      summary: 'Triệu chứng chưa rõ ràng, nghi ngờ thán thư',
    };

    const outputBuffer = await attachDiagnosisBannerToImage(
      sampleImageBuffer,
      params,
    );

    expect(outputBuffer).toBeDefined();
    const meta = await sharp(outputBuffer).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(440);
  });

  it('should gracefully fallback to original buffer on error without throwing', async () => {
    const corruptedBuffer = Buffer.from('not-an-image');
    const params: DiagnosisBannerParams = {
      cropType: 'Lúa',
      disease: 'Test',
      caseType: 'NO_SOLUTION',
      diagnosisId: 'err-test',
    };

    const result = await attachDiagnosisBannerToImage(
      corruptedBuffer,
      params,
    );
    expect(result).toEqual(corruptedBuffer);
  });
});
