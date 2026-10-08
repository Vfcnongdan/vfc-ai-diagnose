import {
  selectDiverseImages,
  mapConcurrent,
  BaseDiseaseRecord,
} from './reference-sampler';

describe('reference-sampler', () => {
  describe('selectDiverseImages', () => {
    it('should return empty array if input records is empty', () => {
      const result = selectDiverseImages([]);
      expect(result).toEqual([]);
    });

    it('should filter out records without images or with empty imageUrls', () => {
      const records: BaseDiseaseRecord[] = [
        { id: '1', pestDisease: 'Đạo ôn', imageUrls: [] },
        { id: '2', pestDisease: 'Đạo ôn', imageUrls: null },
        { id: '3', pestDisease: 'Đạo ôn', imageUrls: ['   '] },
        { id: '4', pestDisease: 'Đạo ôn', imageUrls: ['https://example.com/img4.jpg'] },
      ];

      const result = selectDiverseImages(records, 8);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('4');
    });

    it('should return all records with images if count is <= maxImages', () => {
      const records: BaseDiseaseRecord[] = [
        { id: '1', pestDisease: 'Đạo ôn', imageUrls: ['https://example.com/1.jpg'] },
        { id: '2', pestDisease: 'Cháy bìa lá', imageUrls: ['https://example.com/2.jpg'] },
      ];

      const result = selectDiverseImages(records, 5);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['1', '2']);
    });

    it('should perform Round-Robin sampling to cover all diseases when count > maxImages', () => {
      // 4 bệnh, tổng cộng 12 bản ghi có ảnh:
      // Bệnh A: 5 ảnh (các mức: Nhẹ, Trung bình, Nặng)
      // Bệnh B: 4 ảnh
      // Bệnh C: 2 ảnh
      // Bệnh D: 1 ảnh
      const records: BaseDiseaseRecord[] = [
        // Bệnh A
        { id: 'A1', pestDisease: 'Đạo ôn', severityLevel: 'Nhẹ', imageUrls: ['imgA1'] },
        { id: 'A2', pestDisease: 'Đạo ôn', severityLevel: 'Trung bình', imageUrls: ['imgA2'] },
        { id: 'A3', pestDisease: 'Đạo ôn', severityLevel: 'Nặng', imageUrls: ['imgA3'] },
        { id: 'A4', pestDisease: 'Đạo ôn', severityLevel: 'Hết cứu', imageUrls: ['imgA4'] },
        { id: 'A5', pestDisease: 'Đạo ôn', severityLevel: 'Không có', imageUrls: ['imgA5'] },
        // Bệnh B
        { id: 'B1', pestDisease: 'Cháy bìa', severityLevel: 'Trung bình', imageUrls: ['imgB1'] },
        { id: 'B2', pestDisease: 'Cháy bìa', severityLevel: 'Nặng', imageUrls: ['imgB2'] },
        { id: 'B3', pestDisease: 'Cháy bìa', severityLevel: 'Nhẹ', imageUrls: ['imgB3'] },
        { id: 'B4', pestDisease: 'Cháy bìa', severityLevel: 'Hết cứu', imageUrls: ['imgB4'] },
        // Bệnh C
        { id: 'C1', pestDisease: 'Sâu cuốn lá', severityLevel: 'Nhẹ', imageUrls: ['imgC1'] },
        { id: 'C2', pestDisease: 'Sâu cuốn lá', severityLevel: 'Trung bình', imageUrls: ['imgC2'] },
        // Bệnh D
        { id: 'D1', pestDisease: 'Vàng lùn', severityLevel: 'Nặng', imageUrls: ['imgD1'] },
      ];

      // Chọn tối đa 6 ảnh
      const result = selectDiverseImages(records, 6);

      expect(result).toHaveLength(6);

      // Đảm bảo cả 4 bệnh đều có ít nhất 1 ảnh đại diện trong vòng 1
      const selectedPests = new Set(result.map((r) => r.pestDisease));
      expect(selectedPests.has('Đạo ôn')).toBe(true);
      expect(selectedPests.has('Cháy bìa')).toBe(true);
      expect(selectedPests.has('Sâu cuốn lá')).toBe(true);
      expect(selectedPests.has('Vàng lùn')).toBe(true);

      // Kiểm tra tính ưu tiên của mức độ nghiêm trọng: 'Trung bình' và 'Nặng' được ưu tiên trước 'Nhẹ'
      // Bệnh A có Trung bình (A2) và Nhẹ (A1) -> A2 phải được chọn ở vòng 1
      const aRecords = result.filter((r) => r.pestDisease === 'Đạo ôn');
      expect(aRecords[0].id).toBe('A2'); // Trung bình
    });

    it('should fallback to detail if pestDisease is missing or empty', () => {
      const records: BaseDiseaseRecord[] = [
        { id: '1', pestDisease: null, detail: 'Đạo ôn lá', imageUrls: ['img1'] },
        { id: '2', pestDisease: '', detail: 'Cháy bìa vi khuẩn', imageUrls: ['img2'] },
      ];

      const result = selectDiverseImages(records, 2);
      expect(result).toHaveLength(2);
    });
  });

  describe('mapConcurrent', () => {
    it('should return empty array for empty items', async () => {
      const result = await mapConcurrent([], 3, async (item) => item);
      expect(result).toEqual([]);
    });

    it('should process all items and maintain original index order', async () => {
      const items = [10, 20, 30, 40, 50];
      const result = await mapConcurrent(items, 2, async (num, idx) => {
        return { original: num, index: idx, squared: num * num };
      });

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({ original: 10, index: 0, squared: 100 });
      expect(result[4]).toEqual({ original: 50, index: 4, squared: 2500 });
    });

    it('should never exceed concurrency limit', async () => {
      const items = Array.from({ length: 10 }, (_, i) => i);
      let activeWorkers = 0;
      let maxSeenConcurrency = 0;

      await mapConcurrent(items, 3, async (num) => {
        activeWorkers++;
        if (activeWorkers > maxSeenConcurrency) {
          maxSeenConcurrency = activeWorkers;
        }
        // Giả lập async delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeWorkers--;
        return num;
      });

      expect(maxSeenConcurrency).toBeLessThanOrEqual(3);
    });
  });
});
