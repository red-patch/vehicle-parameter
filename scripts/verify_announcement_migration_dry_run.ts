/**
 * 公告数据迁移 dry-run 验证（一次性脚本，只读不写）。
 * 用真实的迁移纯函数（deriveMigrationCandidate / buildMigrationRecord / uniquifyBaseName）
 * 对真实资产库做全量演算，验证：
 *   1. 能从 _asset_tags.json 找到全部「公告数据」资产；
 *   2. 每条都能推导出合法的公告记录（公告号/批次/车型名/基名）；
 *   3. 撞名基名能正确唯一化。
 *
 * 用法：npx vite-node scripts/verify_announcement_migration_dry_run.ts [资产库路径]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deriveMigrationCandidate, buildMigrationRecord } from '../src/utils/announcementMigration';
import { uniquifyBaseName, validateAnnouncementRecord } from '../src/utils/announcementRecord';
import type { VehicleParameter } from '../src/types';

const LIB = process.argv[2] || '/Users/ethan/车型数据库';

const tagsRaw = JSON.parse(readFileSync(join(LIB, '_asset_tags.json'), 'utf8')) as Record<string, unknown>;
const tagsOf = (v: unknown): string[] =>
    Array.isArray(v) ? (v as string[]) : (v as { tags?: string[] })?.tags ?? [];

const tagged = Object.entries(tagsRaw).filter(([, v]) => tagsOf(v).includes('公告数据'));
console.log(`资产库: ${LIB}`);
console.log(`「公告数据」标签资产: ${tagged.length} 条\n`);

const taken = new Set<string>();
let ok = 0;
let skip = 0;
let fail = 0;

for (const [fileName] of tagged) {
    const full = join(LIB, fileName);
    if (!existsSync(full)) {
        console.log(`⚠ 跳过（文件不存在，标签悬空）: ${fileName}`);
        skip++;
        continue;
    }
    const parsed = JSON.parse(readFileSync(full, 'utf8')) as {
        productName?: string;
        updatedAt?: string;
        parameters?: VehicleParameter[];
    };
    if (!Array.isArray(parsed.parameters)) {
        console.log(`✗ 无法解析（无 parameters 数组）: ${fileName}`);
        fail++;
        continue;
    }
    const candidate = deriveMigrationCandidate(fileName, parsed.productName ?? null, parsed.parameters, parsed.updatedAt ?? null);
    const base = uniquifyBaseName(candidate.baseName, taken);
    taken.add(base);
    const record = buildMigrationRecord(candidate, parsed.parameters);
    const valid = validateAnnouncementRecord(record);
    const mark = valid ? '✓' : '✗';
    console.log(`${mark} ${fileName}`);
    console.log(`    → ${base}.json ｜ 公告号=${candidate.announceNo} ｜ 批次=${candidate.batch || '—'} ｜ 车型名=${candidate.vehicleName || '—'} ｜ 参数=${candidate.paramCount}`);
    if (valid) ok++;
    else fail++;
}

console.log(`\nDRY-RUN 结果: ${ok} 条可生成有效公告记录 ｜ ${fail} 条失败 ｜ ${skip} 条悬空跳过`);
console.log(`目标目录 ${join(LIB, '公告PDF')}（本次未写入任何文件）`);
if (fail > 0) process.exit(1);
