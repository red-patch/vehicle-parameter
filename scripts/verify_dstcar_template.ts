/**
 * 车上云模板解析校验（一次性验证脚本）
 *
 * 用途：把一份「车上云系统导入_*.xlsx」发到车上云的模板解析接口，取回服务端逐行异常，
 *      用于核对我们的导出为什么被拒（列不属于该模版 / 取值有误 / 必填未填）。
 *
 * 接口（供应链中心 productAccess 页面「批量导入」用，见 productParameters.vue）：
 *   POST /dst-apis/1/operateBasic/productAccess/finish/parseTemplate?templateId=&basicId=
 *   Header: token=<登录态 token>；Body: multipart/form-data，字段名 file
 *
 * 用法：
 *   DST_TOKEN=<token> npx vite-node scripts/verify_dstcar_template.ts -- <xlsx> [templateId]
 *
 *   - token 取值：登录 https://eportal-scm.dstcar.com/ 后，F12 任一 dst-apis 请求里的 token 请求头
 *     （即 cookie 里的 token；有效期很短，失效会返回 code=1001 令牌验证不通过）
 *   - templateId 省略时先调 developTypeRelatedAttribute/getList 取模板列表的第一项
 *     （类别/区域不同应选对应模板，例如「中国大陆地区-Ⅰ/Ⅱ/Ⅲ类模板-无人车」）
 *
 * 说明：本脚本只是一次性排查工具，不接进产品代码；不得把 token 写进仓库或任何配置文件。
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const BASE = 'https://eportal-scm.dstcar.com/dst-apis/1';

interface TemplateOption { id: string; developName: string }
interface ParseMessage { key: string; msg: string }

function token(): string {
    const t = process.env.DST_TOKEN?.trim();
    if (!t) throw new Error('缺少 DST_TOKEN 环境变量（见脚本头注释）');
    return t;
}

async function listTemplates(): Promise<TemplateOption[]> {
    const res = await fetch(`${BASE}/operateBasic/developTypeRelatedAttribute/getList`, {
        method: 'POST',
        headers: { token: token(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ productAccessBasic: { categoryId: null, accessArea: null, carriageType: null, developId: null } }),
    });
    const json = await res.json() as { code: string; data?: TemplateOption[]; msg?: string };
    if (json.code !== '200' || !json.data) throw new Error(`取模板列表失败：${json.msg ?? JSON.stringify(json)}`);
    return json.data;
}

async function main() {
    const [, , filePath, templateIdArg] = process.argv;
    if (!filePath) {
        console.error('用法：DST_TOKEN=<token> npx vite-node scripts/verify_dstcar_template.ts -- <xlsx> [templateId]');
        process.exit(1);
    }

    const templates = await listTemplates();
    const templateId = templateIdArg || templates[0]?.id;
    const template = templates.find((t) => t.id === templateId);
    if (!templateId) throw new Error('没有可用模板');
    console.log(`文件：${basename(filePath)}`);
    console.log(`模板：${template?.developName ?? templateId}（${templateId}）`);

    const file = await readFile(filePath);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }), basename(filePath));

    const res = await fetch(`${BASE}/operateBasic/productAccess/finish/parseTemplate?templateId=${templateId}&basicId=`, {
        method: 'POST',
        headers: { token: token() },
        body: form,
    });
    const json = await res.json() as { status: boolean; code: string; msg: ParseMessage[] | string };

    if (json.code === '1001') throw new Error('token 已失效，重新登录后从浏览器请求头里复制新 token');
    if (Array.isArray(json.msg)) {
        const byRow = new Map<number, string[]>();
        for (const { key, msg } of json.msg) {
            const row = Number(/\[(\d+)\]/.exec(key)?.[1] ?? 0);
            byRow.set(row, [...(byRow.get(row) ?? []), msg]);
        }
        console.log(`\n服务端判定：${json.msg.length} 条异常，涉及 ${byRow.size} 行\n`);
        for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
            console.log(`第 ${row} 行`);
            for (const msg of new Set(byRow.get(row))) console.log(`  - ${msg}`);
        }
    } else {
        console.log(`\n服务端返回 code=${json.code}：${json.msg}`);
    }
}

main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
