/**
 * 只读验证：对真实公告库跑分组树，对照设计文档验收标准 #1-#4。
 * 用法：npx vite-node scripts/verify_archive_grouping_dry_run.ts <公告PDF目录>
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    buildAnnouncementTree,
    filterArchiveInfos,
    type JoinedAsset,
} from '../src/utils/announcementGrouping';
import type { AnnouncementInfo } from '../src/utils/announcementRecord';

const dir = process.argv[2];
if (!dir) {
    console.error('用法: npx vite-node scripts/verify_archive_grouping_dry_run.ts <公告PDF目录>');
    process.exit(1);
}

// 从 JSON 文件构造 AnnouncementInfo 形状（只取分组所需字段）
const infos: AnnouncementInfo[] = readdirSync(dir)
    .filter(n => n.endsWith('.json') && !n.startsWith('_'))
    .map(name => {
        const r = JSON.parse(readFileSync(join(dir, name), 'utf8'));
        return {
            jsonFile: name,
            announceNo: String(r.announceNo ?? ''),
            batch: r.batch ? String(r.batch) : null,
            vehicleName: r.vehicleName ? String(r.vehicleName) : null,
            importedAt: String(r.importedAt ?? ''),
            sourceUrl: null,
            hasPdf: false,
            pdfFile: null,
            paramCount: Array.isArray(r.parameters) ? r.parameters.length : 0,
            orphan: false,
        };
    });

const noAssets = new Map<string, JoinedAsset[]>();
const groups = buildAnnouncementTree(infos, noAssets);

console.log(`记录数: ${infos.length}，分组数: ${groups.length}`);
console.log('── 分组树（链头★ / 历史○）──');
for (const g of groups) {
    const badge = g.unsorted
        ? `${g.records.length} 条待认领`
        : `${g.announces.length} 公告号 · ${g.records.length} 记录`;
    console.log(`▸ ${g.displayName}（${badge}）关联资产 ${g.linkedAssetCount}`);
    if (g.unsorted) {
        for (const r of g.records) console.log(`   · ${r.announceNo} | ${r.batch ?? '无批次'}`);
        continue;
    }
    for (const node of g.announces) {
        console.log(`   ${node.announceNo}`);
        console.log(`   ★ ${node.head.batch ?? '无批次'}`);
        for (const h of node.history) console.log(`   ○ ${h.batch ?? '无批次'}`);
    }
}

console.log('── 筛选抽查 ──');
console.log(`搜索 403: ${filterArchiveInfos(infos, 'all', '403', noAssets).map(r => `${r.vehicleName ?? '∅'}|${r.announceNo}|${r.batch}`).join('  ')}`);
console.log(`chips 未归类: ${filterArchiveInfos(infos, 'unsorted', '', noAssets).length} 条`);
