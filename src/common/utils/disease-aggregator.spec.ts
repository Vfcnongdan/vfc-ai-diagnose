import { aggregateDiseases, RawDiseaseRecord } from './disease-aggregator';

describe('disease-aggregator', () => {
  it('should return empty array for empty input', () => {
    expect(aggregateDiseases([])).toEqual([]);
  });

  it('should consolidate duplicate disease records into 1 unique disease entity', () => {
    const raw: RawDiseaseRecord[] = [
      {
        id: '1',
        cropType: 'Lúa',
        growthStage: 'Mạ',
        pestDisease: 'Nấm',
        detail: 'Bệnh đạo ôn',
        severityLevel: 'Nhẹ',
        imageUrls: ['https://example.com/dao-on-nhe.jpg'],
        description: 'Vết chấm nhỏ trên lá.',
        vfcSolution: 'Beam 75WP',
      },
      {
        id: '2',
        cropType: 'Lúa',
        growthStage: 'Đẻ nhánh',
        pestDisease: 'Nấm',
        detail: 'Bệnh đạo ôn',
        severityLevel: 'Trung bình',
        imageUrls: ['https://example.com/dao-on-tb.jpg'],
        description: 'Vết bệnh hình thoi, đốm mắt én viền nâu xám.',
        vfcSolution: 'Beam 75WP',
      },
      {
        id: '3',
        cropType: 'Lúa',
        growthStage: 'Trổ chín',
        pestDisease: 'Nấm',
        detail: 'Bệnh đạo ôn',
        severityLevel: 'Nặng',
        imageUrls: ['https://example.com/dao-on-nang.jpg'],
        description: 'Cổ bông thối đen, lép hạt.',
        vfcSolution: 'Flash 75WP',
      },
    ];

    const aggregated = aggregateDiseases(raw);

    // 3 bản ghi chỉ còn 1 bệnh duy nhất
    expect(aggregated).toHaveLength(1);
    const item = aggregated[0];
    expect(item.detail).toBe('Bệnh đạo ôn');

    // Gom đủ 3 ảnh
    expect(item.imageUrls).toEqual([
      'https://example.com/dao-on-nhe.jpg',
      'https://example.com/dao-on-tb.jpg',
      'https://example.com/dao-on-nang.jpg',
    ]);

    // Gom giải pháp khử trùng lặp: Nhẹ và Trung bình cùng Beam 75WP
    expect(item.vfcSolution).toContain('Nhẹ/Trung bình');
    expect(item.vfcSolution).toContain('Beam 75WP');
    expect(item.vfcSolution).toContain('Nặng');
    expect(item.vfcSolution).toContain('Flash 75WP');

    // Ghi nhận đầy đủ các giai đoạn xuất hiện
    expect(item.stagesCovered).toContain('Mạ');
    expect(item.stagesCovered).toContain('Đẻ nhánh');
    expect(item.stagesCovered).toContain('Trổ chín');
  });

  it('should single out solution if all severities have identical solution', () => {
    const raw: RawDiseaseRecord[] = [
      {
        id: '1',
        detail: 'Sâu cuốn lá',
        severityLevel: 'Nhẹ',
        description: 'Mô tả 1',
        vfcSolution: 'Virtako 40WG',
      },
      {
        id: '2',
        detail: 'Sâu cuốn lá',
        severityLevel: 'Nặng',
        description: 'Mô tả 2',
        vfcSolution: 'Virtako 40WG',
      },
    ];

    const aggregated = aggregateDiseases(raw);
    expect(aggregated).toHaveLength(1);
    // Khi giải pháp giống nhau hoàn toàn, không cần chia dòng phức tạp
    expect(aggregated[0].vfcSolution).toBe('Virtako 40WG');
  });

  it('should prioritize preferredStage diseases to the front (Soft Re-ranking)', () => {
    const raw: RawDiseaseRecord[] = [
      {
        id: '1',
        growthStage: 'Trổ chín',
        detail: 'Đạo ôn cổ bông',
        severityLevel: 'Nặng',
        description: 'Thối cổ bông',
        vfcSolution: 'Beam 75WP',
      },
      {
        id: '2',
        growthStage: 'Mạ',
        detail: 'Bọ trĩ',
        severityLevel: 'Nhẹ',
        description: 'Bọ trĩ cắn lá non',
        vfcSolution: 'Actara',
      },
    ];

    // Ưu tiên giai đoạn Mạ
    const aggregated = aggregateDiseases(raw, 'Mạ');
    expect(aggregated).toHaveLength(2);
    // Bọ trĩ thuộc giai đoạn Mạ phải đứng đầu
    expect(aggregated[0].detail).toBe('Bọ trĩ');
    // Đạo ôn cổ bông thuộc Trổ chín đứng thứ hai nhưng VẪN CÓ MẶT
    expect(aggregated[1].detail).toBe('Đạo ôn cổ bông');
  });
});
