/**
 * 车上云「上传异常数据处理提示」抓取脚本（书签 / bookmarklet）
 *
 * 为什么需要它：那个弹窗是表格，直接拖选常带表头、合并单元格、水印文本，
 * 粘回来还得手动删。装一次书签，以后点一下就复制干净的回执。
 *
 * 与公告中心的提取书签（AnnouncementQuery 的 BOOKMARKLET_CODE）同一套用法：
 * 拖到书签栏 → 在车上云弹窗页点一下 → 回执进剪贴板。
 *
 * 脚本只读 DOM、只写剪贴板，不发任何请求。
 * 设计：docs/plans/2026-10-20-上传回执修正-design.md
 */

/**
 * 抓取逻辑（不含 javascript: 前缀）。
 *
 * 抓取策略（由宽到窄，取第一个有结果的）：
 * 1. 找含「不属于该模版 / 的取值 / 必填 / 不存在」的元素，向上收敛到行容器
 * 2. 每行取「第[N]行」与提示文本，拼成 `第[N]行 提示`
 * 3. 兜底：整段 innerText 里正则扫
 *
 * 书签里不能用反引号、也尽量不用换行缩进（部分浏览器把 javascript: URL 当单行解析），
 * 所以这里写成一整行、只用单引号与字符串拼接。
 */
const FEEDBACK_BODY = [
  "(function(){",
  "var TIP=/(列不属于该模版|不属于该模版|的取值.*有误|必填|不存在)/;",
  "var ROW=/第\\s*\\[?\\s*(\\d+)\\s*\\]?\\s*行/;",
  "function clean(s){return (s||'').replace(/\\u00a0/g,' ').replace(/\\s+/g,' ').trim();}",
  "function done(lines){",
  "if(!lines.length){alert('没抓到报错行。请先打开「上传异常数据处理提示」弹窗再点此书签。');return;}",
  "var out=lines.join('\\n');",
  "var fallback=function(){var t=document.createElement('textarea');t.value=out;document.body.appendChild(t);t.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(t);alert('已复制 '+lines.length+' 条回执，请回到工作台粘贴到「上传回执修正」。');};",
  "if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(out).then(function(){alert('已复制 '+lines.length+' 条回执，请回到工作台粘贴到「上传回执修正」。');}).catch(fallback);}else{fallback();}",
  "}",
  "try{",
  "var tips=Array.prototype.slice.call(document.querySelectorAll('td,li,div,span')).filter(function(el){",
  "var t=clean(el.textContent);",
  "if(!t||t.length>200)return false;",
  "if(!TIP.test(t))return false;",
  "return !Array.prototype.some.call(el.children,function(c){return TIP.test(clean(c.textContent));});",
  "});",
  "var lines=[];",
  "tips.forEach(function(el){",
  "var node=el,hit=null;",
  "for(var i=0;i<5&&node;i++){var t=clean(node.textContent);if(ROW.test(t)){hit=t;break;}node=node.parentElement;}",
  "if(!hit)return;",
  "var idx=hit.search(ROW);",
  "lines.push(hit.slice(idx).match(ROW)[0]+' '+hit.slice(idx).replace(ROW,'').trim());",
  "});",
  "lines=lines.filter(function(l,i){return lines.indexOf(l)===i;});",
  "if(lines.length===0){",
  "var all=document.body.innerText.split(/\\n+/);",
  "lines=all.map(clean).filter(function(l){return ROW.test(l)&&TIP.test(l);});",
  "}",
  "done(lines);",
  "}catch(e){alert('抓取出错：'+e.message);}",
  "})();",
].join('');

/** 可拖到书签栏的完整 bookmarklet（带 javascript: 前缀） */
export const DSTCAR_FEEDBACK_BOOKMARKLET = `javascript:${FEEDBACK_BODY}`;

/** 控制台里也能直接跑的版本（同逻辑，便于排查） */
export const DSTCAR_FEEDBACK_SCRIPT = FEEDBACK_BODY;

/** 给 UI 展示的简短说明 */
export const DSTCAR_FEEDBACK_SCRIPT_HINT =
    '把「抓取回执」按钮拖到浏览器书签栏；在车上云报错弹窗打开的页面上点一下，回执会自动复制。';
