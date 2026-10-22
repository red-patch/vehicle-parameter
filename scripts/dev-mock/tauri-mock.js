/**
 * VPW 浏览器预览用的 Tauri 模拟层。
 *
 * 只在 `npm run dev:mock`（`vite --mode mock`）时由 vite.config.ts 注入 <head> 最前；
 * `npm run dev` / `tauri dev` / 生产构建都不包含它。
 *
 * 为什么要有它：应用依赖 Tauri 运行时（文件系统、路径、Rust 命令），没有 Tauri 的环境
 * （AI agent 的沙箱、浏览器调试、截图回归）打开页面就是一片报错，界面改动只能「盲改」。
 *
 * 行为：
 * - 文件系统 = 内存 Map；挂一个空资产库 `/mock/lib`（自动写入应用设置）；刷新页面即清空
 * - Rust 命令：`scan_asset_library` / `save_assets_batch` 抛错 → 应用走前端 JS 回退路径；
 *   其余扫描类返回空结果；未知命令返回 null
 * - 数据从界面导入（如「车型资产 → 导入 Excel」）；真实车辆数据不要提交进仓库
 *
 * 可选预置（在页面脚本执行前设置，如 Playwright 的 addInitScript）：
 *   window.__VPW_MOCK_FILES__ = { 'custom_enums.json': { 车身颜色: ['白色'] } }
 *   键是资产库内的相对路径，值是文本或可 JSON 序列化的对象。
 * 调试：window.__VPW_MOCK_FS__ 可直接查看/改写内存文件。
 */
(() => {
    const LIB = '/mock/lib';
    const APP_DATA = '/mock/appdata';
    const files = new Map(); // 绝对路径 → 文本内容
    const callbacks = new Map();
    let nextId = 1;
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const norm = (p) => String(p ?? '').replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
    const toBytes = (text) => Array.from(enc.encode(text));
    const fromBytes = (data) => dec.decode(data instanceof Uint8Array ? data : new Uint8Array(data ?? []));
    const under = (dir) => [...files.keys()].filter((k) => k.startsWith(dir + '/'));
    const isDir = (p) => p === LIB || p === APP_DATA || under(p).length > 0;

    for (const [rel, content] of Object.entries(window.__VPW_MOCK_FILES__ || {})) {
        files.set(norm(`${LIB}/${rel}`), typeof content === 'string' ? content : JSON.stringify(content));
    }

    const read = ({ path }) => {
        const p = norm(path);
        if (!files.has(p)) throw new Error(`[tauri-mock] 文件不存在：${p}`);
        return toBytes(files.get(p));
    };
    // plugin-fs v2 的写入把内容作为请求体（args），路径放在请求头里
    const write = (data, opts) => {
        files.set(norm(decodeURIComponent(opts?.headers?.path ?? '')), fromBytes(data));
        return null;
    };
    const move = (from, to, keepSource) => {
        const src = norm(from);
        const dst = norm(to);
        for (const k of [src, ...under(src)]) {
            if (!files.has(k)) continue;
            files.set(dst + k.slice(src.length), files.get(k));
            if (!keepSource) files.delete(k);
        }
        return null;
    };

    const handlers = {
        // ── 文件系统（@tauri-apps/plugin-fs）──
        'plugin:fs|exists': ({ path }) => files.has(norm(path)) || isDir(norm(path)),
        'plugin:fs|read_dir': ({ path }) => {
            const dir = norm(path);
            const entries = new Map();
            for (const k of under(dir)) {
                const rest = k.slice(dir.length + 1);
                const name = rest.split('/')[0];
                const directory = rest.includes('/');
                if (!entries.has(name)) entries.set(name, { name, isFile: !directory, isDirectory: directory, isSymlink: false });
            }
            return [...entries.values()];
        },
        'plugin:fs|read_text_file': read,
        'plugin:fs|read_file': read,
        'plugin:fs|write_text_file': write,
        'plugin:fs|write_file': write,
        'plugin:fs|mkdir': () => null, // 目录是隐式的：有文件即存在
        'plugin:fs|remove': ({ path }) => {
            const p = norm(path);
            files.delete(p);
            for (const k of under(p)) files.delete(k);
            return null;
        },
        'plugin:fs|rename': ({ oldPath, newPath }) => move(oldPath, newPath, false),
        'plugin:fs|copy_file': ({ fromPath, toPath }) => move(fromPath, toPath, true),

        // ── 路径（@tauri-apps/api/path）──
        'plugin:path|join': ({ paths }) => norm(paths.join('/')),
        'plugin:path|resolve': ({ paths }) => norm(paths.join('/')),
        'plugin:path|normalize': ({ path }) => norm(path),
        'plugin:path|dirname': ({ path }) => norm(path).split('/').slice(0, -1).join('/') || '/',
        'plugin:path|basename': ({ path, ext }) => {
            const base = norm(path).split('/').pop() ?? '';
            return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
        },
        'plugin:path|extname': ({ path }) => (/\.([^./]+)$/.exec(norm(path)) ?? [])[1] ?? '',
        'plugin:path|resolve_directory': ({ path }) => norm(`${APP_DATA}/${path ?? ''}`),

        // ── 事件 / 窗口 ──
        'plugin:event|listen': () => nextId++,
        'plugin:event|unlisten': () => null,
        'plugin:event|emit': () => null,

        // ── Rust 命令 ──
        // 抛错 → 应用走前端 JS 回退（逐个读写资产 JSON），正好落在上面的内存文件系统里
        scan_asset_library: () => { throw new Error('[tauri-mock] 走前端回退'); },
        save_assets_batch: () => { throw new Error('[tauri-mock] 走前端回退'); },
        scan_regulations: () => ({ rootExists: false, records: [], unregistered: [], sidecarExists: false }),
        mobile_server_status: () => ({ running: false, enabled: false, port: 0, devices: [] }),
    };

    window.__VPW_MOCK_FS__ = files;
    window.__TAURI_INTERNALS__ = {
        metadata: {
            currentWindow: { label: 'main' },
            currentWebview: { windowLabel: 'main', label: 'main' },
        },
        plugins: { path: { sep: '/', delimiter: ':' } },
        transformCallback: (cb) => {
            const id = nextId++;
            callbacks.set(id, cb);
            return id;
        },
        unregisterCallback: (id) => callbacks.delete(id),
        convertFileSrc: (p) => p,
        invoke: async (cmd, args, opts) => {
            const handler = handlers[cmd];
            if (handler) return handler(args ?? {}, opts);
            if (/^(scan_|list_|probe_)/.test(cmd)) return [];
            return null; // 窗口/对话框/其余命令：静默成功
        },
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };

    // 应用设置里指向模拟资产库（zustand persist），否则首屏会提示「资产库目录未设置」
    try {
        const key = 'vehicle-parameter-storage';
        const saved = JSON.parse(localStorage.getItem(key) || '{"state":{},"version":0}');
        if (!saved.state?.assetLibraryPath) {
            saved.state = { ...saved.state, assetLibraryPath: LIB };
            localStorage.setItem(key, JSON.stringify(saved));
        }
    } catch {
        /* localStorage 不可用时忽略：页面会提示设置资产库目录 */
    }
    console.info('[tauri-mock] 已启用：内存文件系统，资产库 %s', LIB);
})();
