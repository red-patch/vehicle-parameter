/**
 * 只读验证：「其它」格拆分后，一次粘贴导入会产出多少条参数。
 * 用法：npx vite-node scripts/verify_other_param_split.ts <miit-helper.json 路径>
 * 走应用同一实现（utils/announcementParamParse），复刻 AnnouncementQuery.handleImport 的行数口径。
 */
import { readFileSync } from 'node:fs';
import {
    OTHER_PARAM_GROUP,
    OTHER_PARAM_NAMES,
    splitOtherParamValue,
} from '../src/utils/announcementParamParse';

const file = process.argv[2];
if (!file) {
    console.error('用法: npx vite-node scripts/verify_other_param_split.ts <json 路径>');
    process.exit(1);
}

const data = JSON.parse(readFileSync(file, 'utf8')) as {
    source: string;
    parameters: { name: string; value: string; group?: string }[];
};

let ordinary = 0;
let otherOrigins = 0;
let otherSubs = 0;
const subNames: string[] = [];

for (const p of data.parameters) {
    if (OTHER_PARAM_NAMES.includes(String(p.name ?? '').trim()) && p.value) {
        otherOrigins += 1;
        const subs = splitOtherParamValue(p.value);
        otherSubs += subs.length;
        subs.forEach(s => subNames.push(`${s.name} = ${s.value}`));
    } else {
        ordinary += 1;
    }
}

const total = ordinary + otherOrigins + otherSubs;
console.log(`原始字段（书签 JSON）: ${data.parameters.length}`);
console.log(`  普通字段            : ${ordinary}`);
console.log(`  「其它」原文整格    : ${otherOrigins}`);
console.log(`  「其它」拆出子项    : ${otherSubs}  (group=${OTHER_PARAM_GROUP})`);
console.log(`导入后总行数          : ${total}`);
console.log('子项清单:');
subNames.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
