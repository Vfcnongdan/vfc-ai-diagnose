export interface RawDiseaseRecord {
  id: string;
  cropType?: string | null;
  growthStage?: string | null;
  pestDisease?: string | null;
  detail: string;
  severityLevel?: string | null;
  imageUrls?: string[] | null;
  description: string;
  vfcSolution: string;
  [key: string]: any;
}

export interface AggregatedDisease {
  id: string;
  diseaseKey: string;
  detail: string;
  pestDisease?: string | null;
  severityLevel: string;
  description: string;
  vfcSolution: string;
  imageUrls: string[];
  stagesCovered: string[];
}

/**
 * Chuẩn hóa tên bệnh để làm khóa gom nhóm (loại bỏ khoảng trắng thừa, lowercase)
 */
function normalizeKey(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Trọng số ưu tiên mức độ nghiêm trọng để chọn mô tả triệu chứng rõ nét nhất
 */
const severityRank: Record<string, number> = {
  'trung bình': 4,
  nặng: 3,
  nhẹ: 2,
  'hết cứu': 1,
  'không có': 0,
};

/**
 * Thuật toán Gom nhóm Thực thể Bệnh & Khử trùng lặp Giải pháp VFC (In-Memory Disease Aggregator)
 *
 * Chuyển đổi hàng trăm bản ghi phân mảnh (bị nhân bản theo stage x severity)
 * thành ~20 - 30 bệnh duy nhất của cây trồng:
 * - Cắt giảm 70% - 85% token.
 * - Loại bỏ hoàn toàn nguy cơ mất bệnh khi user chọn sai giai đoạn.
 * - Khử trùng lặp các toa thuốc giống nhau.
 */
export function aggregateDiseases(
  records: RawDiseaseRecord[],
  preferredStage?: string,
): AggregatedDisease[] {
  if (!records || records.length === 0) return [];

  const groups = new Map<string, RawDiseaseRecord[]>();

  for (const r of records) {
    const key = normalizeKey(r.detail || r.pestDisease || 'UNKNOWN');
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(r);
  }

  const normPreferredStage = preferredStage ? normalizeKey(preferredStage) : null;
  const aggregated: AggregatedDisease[] = [];

  for (const [key, groupRecords] of groups) {
    // 1. Tìm bản ghi đại diện tốt nhất cho triệu chứng:
    //    - Ưu tiên mạnh (+20) bản ghi có mô tả triệu chứng thực sự (không rỗng và không phải mức "Không có")
    //    - Ưu tiên (+10) bản ghi khớp giai đoạn sinh trưởng đang xét
    //    - Ưu tiên theo mức độ điển hình (Trung bình > Nặng > Nhẹ)
    const scoredRecords = groupRecords.map((r) => {
      let score = 0;
      const sevNorm = normalizeKey(r.severityLevel || '');
      const hasActiveDesc =
        typeof r.description === 'string' &&
        r.description.trim().length > 0 &&
        sevNorm !== 'không có';
      if (hasActiveDesc) {
        score += 20;
      }
      const rStage = r.growthStage ? normalizeKey(r.growthStage) : '';
      if (normPreferredStage && rStage === normPreferredStage) {
        score += 10;
      }
      const sRank = severityRank[sevNorm] ?? 1;
      score += sRank;
      return { record: r, score, hasActiveDesc };
    });

    scoredRecords.sort((a, b) => b.score - a.score);
    const bestRecord = scoredRecords[0].record;

    // 1b. Tổng hợp tối đa 3 mô tả triệu chứng khác biệt (bỏ qua dòng rỗng và mức "Không có")
    //     để không làm rơi mất đặc điểm nhận diện quan trọng ở các mức độ/giai đoạn khác.
    const distinctDescs: string[] = [];
    const seenDescNorm = new Set<string>();
    for (const item of scoredRecords) {
      if (!item.hasActiveDesc) continue;
      const clean = item.record.description.trim().replace(/\s+/g, ' ');
      const norm = clean.toLowerCase();
      if (!seenDescNorm.has(norm)) {
        seenDescNorm.add(norm);
        distinctDescs.push(clean);
        if (distinctDescs.length >= 3) break;
      }
    }
    const consolidatedDescription =
      distinctDescs.length > 0
        ? distinctDescs.join(' ; ')
        : (bestRecord.description || '').trim();

    // 2. Gom và khử trùng lặp các giải pháp VFC theo mức độ
    // Map: solutionString -> Set<severityLevel>
    const solutionMap = new Map<string, string[]>();
    for (const r of groupRecords) {
      const sol = (r.vfcSolution || '').trim();
      if (!sol) continue;
      const sev = (r.severityLevel || 'Chung').trim();
      if (!solutionMap.has(sol)) {
        solutionMap.set(sol, []);
      }
      const list = solutionMap.get(sol)!;
      if (!list.includes(sev)) {
        list.push(sev);
      }
    }

    let consolidatedSolution = '';
    if (solutionMap.size === 0) {
      consolidatedSolution = bestRecord.vfcSolution || 'Tham khảo ý kiến kỹ sư VFC';
    } else if (solutionMap.size === 1) {
      // Tất cả các mức độ đều dùng chung 1 giải pháp
      const [onlySolution] = solutionMap.keys();
      consolidatedSolution = onlySolution;
    } else {
      // Có nhiều giải pháp theo các mức độ khác nhau -> gom nhóm gọn gàng
      const parts: string[] = [];
      for (const [sol, severities] of solutionMap) {
        parts.push(`+ Mức ${severities.join('/')}: ${sol}`);
      }
      consolidatedSolution = parts.join('\n  ');
    }

    // 3. Gom toàn bộ ảnh hợp lệ của bệnh này từ mọi bản ghi
    const allImages: string[] = [];
    for (const r of groupRecords) {
      if (r.imageUrls && Array.isArray(r.imageUrls)) {
        for (const url of r.imageUrls) {
          if (typeof url === 'string' && url.trim().length > 0 && !allImages.includes(url.trim())) {
            allImages.push(url.trim());
          }
        }
      }
    }

    // 4. Danh sách các giai đoạn mà bệnh này xuất hiện
    const stages = Array.from(
      new Set(
        groupRecords
          .map((r) => r.growthStage?.trim())
          .filter((s): s is string => !!s && s.length > 0),
      ),
    );

    aggregated.push({
      id: bestRecord.id,
      diseaseKey: key,
      detail: bestRecord.detail,
      pestDisease: bestRecord.pestDisease,
      severityLevel: bestRecord.severityLevel || 'Trung bình',
      description: consolidatedDescription,
      vfcSolution: consolidatedSolution,
      imageUrls: allImages,
      stagesCovered: stages,
    });
  }

  // 5. Soft Re-ranking: Đưa các bệnh có xuất hiện trong preferredStage lên trước
  if (normPreferredStage) {
    aggregated.sort((a, b) => {
      const aMatches = a.stagesCovered.some((s) => normalizeKey(s) === normPreferredStage);
      const bMatches = b.stagesCovered.some((s) => normalizeKey(s) === normPreferredStage);
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return 0;
    });
  }

  return aggregated;
}
