/**
 * Chuẩn hóa mô tả phân biệt cho bệnh "Rong, Tảo" / "Đốm rong" trên cây Sầu riêng
 * trong bảng plan_stage_diseases để khắc phục lỗi:
 *   1. Bản ghi ở giai đoạn "Cơi đọt" bị nhập sai pest_disease="Sâu" và description="" (rỗng).
 *   2. Bản ghi ở giai đoạn "Nuôi trái" bị dán nhầm mô tả trái ("Trái méo, múi không đầy, cơm không đều.").
 *   3. Bổ sung đặc điểm phân biệt âm tính cho đốm rong trên lá (lớp tảo nổi nhám trên bề mặt lá già,
 *      KHÔNG phải vết hoại tử lõm khô xuyên mô lá hay đốm mắt cua có viền nâu sẫm và quầng vàng).
 *
 * Cách dùng:
 *   npx ts-node scripts/fix-sau-rieng-rong-tao-descriptions.ts --env .env --dry-run
 *   npx ts-node scripts/fix-sau-rieng-rong-tao-descriptions.ts --env .env
 *   npx ts-node scripts/fix-sau-rieng-rong-tao-descriptions.ts --env .env.staging
 *   npx ts-node scripts/fix-sau-rieng-rong-tao-descriptions.ts --env .env.production --confirm-prod
 */
import * as fs from 'fs';
import { Pool } from 'pg';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const envFile = arg('env') ?? '.env';
const dryRun = flag('dry-run');

if (!fs.existsSync(envFile)) {
  console.error(`Không tìm thấy file môi trường: ${envFile}`);
  process.exit(1);
}

const content = fs.readFileSync(envFile, 'utf8');
let dbUrl = '';
for (const line of content.split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const m = line.match(/^\s*(?:DIRECT_URL|DATABASE_URL)\s*=\s*["']?([^"'\r\n]+)["']?/);
  if (m) {
    dbUrl = m[1].trim();
    break;
  }
}

if (!dbUrl) {
  console.error(`Không tìm thấy DATABASE_URL / DIRECT_URL trong ${envFile}`);
  process.exit(1);
}

const isProdDb = /ep-shiny-base/.test(dbUrl);
if (isProdDb && !dryRun && !flag('confirm-prod')) {
  console.error('CHẶN AN TOAN: Target đang là DB PRODUCTION (ep-shiny-base). Phải truyền thêm --confirm-prod mới được phép ghi!');
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(dbUrl);
const pool = new Pool({
  connectionString: isLocal ? dbUrl : dbUrl.includes('uselibpqcompat') ? dbUrl : `${dbUrl}&uselibpqcompat=true`,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

const STANDARD_LEAF_RONG_DESC =
  'Lá già xuất hiện các đốm tảo tròn màu cam, đỏ gạch hoặc xanh xám nổi nhám mịn như nhung rêu trên bề mặt biểu bì (10-20% diện tích lá, lá hơi bạc màu; cạo nhẹ có thể tróc lớp tảo). Phân biệt: KHÔNG phải vết hoại tử lõm khô xuyên mô lá hay đốm mắt cua có viền nâu sẫm và quầng vàng.';

const LIGHT_LEAF_RONG_DESC =
  'Khoảng 5% diện tích lá già có đốm rong tảo nổi nhám mịn màu cam đỏ hoặc xanh xám trên bề mặt lá (không phải vết lõm khô xuyên phiến lá).';

const TRUNK_RONG_DESC =
  'Mảng rong rêu màu xanh xám, cam gỉ hoặc trắng xám bám nổi trên vỏ thân, cành ở vườn ẩm rợp, làm cây kém quang hợp và giảm sức nuôi trái.';

async function main() {
  console.log(`\n=== CHUẨN HÓA MÔ TẢ RONG TẢO / ĐỐM RONG SẦU RIÊNG (${envFile})${dryRun ? ' [DRY-RUN]' : ''} ===`);
  const res = await pool.query(`
    SELECT id, growth_stage, pest_disease, detail, severity_level, description
    FROM plan_stage_diseases
    WHERE LOWER(crop_type) = LOWER('Sầu riêng')
      AND (detail ILIKE '%rong%' OR detail ILIKE '%tảo%')
    ORDER BY detail, growth_stage, severity_level
  `);

  console.log(`Tìm thấy ${res.rows.length} bản ghi Rong/Tảo trên Sầu riêng:`);
  let updatedCount = 0;

  for (const r of res.rows) {
    const descTrim = (r.description || '').trim();
    const sevNorm = (r.severity_level || '').trim().toLowerCase();
    let newPest = r.pest_disease;
    let newDesc = descTrim;

    // 1. Sửa pest_disease bị nhập nhầm là "Sâu"
    if ((r.pest_disease || '').trim().toLowerCase() === 'sâu') {
      newPest = 'Bệnh';
    }

    // 2. Sửa các dòng mô tả rỗng ở Cơi đọt / Sau thu hoạch
    if (!descTrim && sevNorm !== 'không có') {
      newDesc = STANDARD_LEAF_RONG_DESC;
    }
    // 3. Sửa dòng bị dán nhầm mô tả sượng/méo trái
    else if (/trái méo,\s*múi không đầy/i.test(descTrim)) {
      newDesc = TRUNK_RONG_DESC;
    }
    // 4. Bổ sung đặc điểm nhận diện bề mặt & phân biệt âm tính cho dòng đốm rong lá mức Nhẹ / Trung bình
    else if (/5%\s*lá có đóm rong|5%\s*lá có đốm rong/i.test(descTrim)) {
      newDesc = LIGHT_LEAF_RONG_DESC;
    } else if (
      /10\s*-\s*20%\s*diện tích lá nhiễm/i.test(descTrim) ||
      /lá xuất hiện các đốm tròn màu cam,\s*đỏ gạch hoặc xanh xám,\s*bề mặt nhám\.?$/i.test(descTrim)
    ) {
      newDesc = STANDARD_LEAF_RONG_DESC;
    }

    if (newPest !== r.pest_disease || newDesc !== descTrim) {
      updatedCount++;
      console.log(`\n  • Cập nhật [${r.id}] (${r.detail} | ${r.growth_stage} | ${r.severity_level}):`);
      if (newPest !== r.pest_disease) {
        console.log(`      pest_disease: "${r.pest_disease}" -> "${newPest}"`);
      }
      if (newDesc !== descTrim) {
        console.log(`      OLD desc: "${descTrim}"`);
        console.log(`      NEW desc: "${newDesc}"`);
      }

      if (!dryRun) {
        await pool.query(
          `UPDATE plan_stage_diseases
           SET pest_disease = $1, description = $2, updated_at = NOW()
           WHERE id = $3`,
          [newPest, newDesc, r.id],
        );
      }
    }
  }

  console.log(`\n➜ Tổng số dòng ${dryRun ? 'sẽ' : 'đã'} cập nhật: ${updatedCount}/${res.rows.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
