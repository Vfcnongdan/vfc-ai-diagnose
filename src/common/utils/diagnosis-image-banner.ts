import sharp from 'sharp';

export interface DiagnosisBannerParams {
  cropType?: string;
  growthStage?: string;
  disease: string;
  confidence?: number;
  caseType: 'NO_SOLUTION' | 'LOW_CONFIDENCE';
  diagnosisId: string;
  summary?: string;
}

function escapeXml(unsafe: string): string {
  return (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

/**
 * Ghép một dải banner thông tin tóm tắt ở đáy ảnh bằng sharp.
 * Giúp chuyên gia/kỹ sư VFC mở ảnh trên Google Drive là nắm ngay bệnh học và lý do sync.
 * Nếu có bất kỳ lỗi xử lý ảnh nào, tự động fallback trả về buffer ảnh gốc an toàn 100%.
 */
export async function attachDiagnosisBannerToImage(
  imageBuffer: Buffer,
  params: DiagnosisBannerParams,
): Promise<Buffer> {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 600;
    const bannerHeight = 140;

    const isNoSolution = params.caseType === 'NO_SOLUTION';
    const badgeText = isNoSolution
      ? 'CHƯA CÓ GIẢI PHÁP VFC'
      : `ĐỘ TIN CẬY THẤP: ${Math.round((params.confidence || 0) * 100)}%`;
    const badgeBg = isNoSolution ? '#dc2626' : '#d97706';

    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const cropText = escapeXml(params.cropType || 'Chưa rõ');
    const stageText = escapeXml(params.growthStage || 'Chưa rõ');
    const diseaseText = escapeXml(params.disease || 'Chưa rõ');
    const idText = escapeXml(params.diagnosisId);
    const summaryText = escapeXml(
      (params.summary || '').slice(0, 95) +
        ((params.summary || '').length > 95 ? '...' : ''),
    );

    const svgBanner = `
      <svg width="${width}" height="${bannerHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#0f172a" />
        <rect x="0" y="0" width="100%" height="3" fill="${badgeBg}" />
        
        <!-- Header Badge -->
        <rect x="16" y="14" width="${badgeText.length * 8.5 + 24}" height="22" rx="4" fill="${badgeBg}" />
        <text x="28" y="29" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#ffffff">${escapeXml(badgeText)}</text>
        
        <text x="${width - 16}" y="29" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#94a3b8">VFC AI Diagnosis System • ${dateStr}</text>

        <!-- Main Info -->
        <text x="16" y="60" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="#f8fafc">
          Cây: <tspan fill="#38bdf8">${cropText}</tspan>  |  Giai đoạn: <tspan fill="#cbd5e1">${stageText}</tspan>  |  Bệnh: <tspan fill="#facc15">${diseaseText}</tspan>
        </text>

        <!-- Summary & ID -->
        <text x="16" y="86" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#cbd5e1">${summaryText}</text>
        <text x="16" y="112" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">Mã chẩn đoán: ${idText}  •  Vui lòng bổ sung phác đồ hoặc thẩm định</text>
      </svg>
    `;

    // Mở rộng ảnh thêm bannerHeight ở đáy và đè SVG banner lên
    const processedImage = await sharp(imageBuffer)
      .extend({
        top: 0,
        left: 0,
        right: 0,
        bottom: bannerHeight,
        background: '#0f172a',
      })
      .composite([
        {
          input: Buffer.from(svgBanner),
          top: metadata.height || 0,
          left: 0,
        },
      ])
      .jpeg({ quality: 88 })
      .toBuffer();

    return processedImage;
  } catch (err) {
    // Fallback an toàn: nếu có lỗi khi vẽ banner, trả lại buffer ảnh gốc
    return imageBuffer;
  }
}
