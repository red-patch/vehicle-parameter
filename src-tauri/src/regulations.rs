//! 法规标准库命令（设计文档 docs/plans/2026-10-08-regulation-library-design.md）
//!
//! P0 范围：旁路文件读写 + 目录扫描 + **文件名解析单源**。
//!
//! 架构约定（设计 §5.1，刻意偏离公告中心）：公告中心把同一套命名解析在 Rust
//! (`announcements.rs::parse_base_name`) 与 TS (`parseAnnouncementBaseName`) 各写
//! 一遍、靠注释维持「同口径」，记录 schema 更是 Rust 两份 + TS 一份。本模块**不再
//! 复制该模式**——文件名解析只在 Rust 发生，前端只消费，永不重新解析。
//!
//! 与公告中心的另一处根本差异：公告是**复制归档**（PDF 拷进 {资产库}/公告PDF/，
//! 归档目录自包含，只有 PDF 没 JSON 的叫「孤儿」待认领）；法规是**引用**（PDF 留在
//! iCloud，工具只持元数据）。故此处**没有「孤儿」概念**，取而代之的是
//! 「未登记文件」（盘上有、旁路文件里没有）与「引用失效」（旁路文件里有、盘上没有）。

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// 旁路文件名（位于法规库根目录）
pub const SIDECAR_NAME: &str = "_regulations.json";
/// 默认扫描深度上限
const DEFAULT_MAX_DEPTH: usize = 8;

// ==================== 数据模型（与前端 regulationTypes.ts 同构，camelCase） ====================

/// 法规记录。身份 = `standard_no`（含部分号），`year` 是版本（设计 §4.2 / Q5）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RegulationRecord {
    #[serde(default = "default_version")]
    pub version: String,
    /// 身份键：规范化标准号（含部分号）—— "GB 44495"、"GB/T 18386.1"、"ISO 26262"
    pub standard_no: String,
    /// 版本：发布年份；无年份（框架文件/白皮书）为 null
    #[serde(default)]
    pub year: Option<String>,
    pub title: String,
    /// 受控属性①：标准层级（单值，可由标准号前缀判定）
    #[serde(default)]
    pub level: String,
    /// 受控属性②：主题域（多值，人工选）
    #[serde(default)]
    pub domains: Vec<String>,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub effective_at: Option<String>,
    /// 现行 / 即将实施 / 已被替代 / 废止 / 草案
    #[serde(default)]
    pub status: String,
    /// true = status 被人工覆盖，不再随日期自动推导
    #[serde(default)]
    pub status_overridden: bool,
    /// 本记录替代的标准号（首页「代替 GB1589—2004」预填）
    #[serde(default)]
    pub replaces: Vec<String>,
    /// 相对法规库根的文件名；null = 无 PDF（合法状态，Q8）
    #[serde(default)]
    pub file_name: Option<String>,
    #[serde(default)]
    pub file_size: Option<u64>,
    /// 引用失效：文件被移走/改名（扫描时比对得出，非持久字段）
    #[serde(default)]
    pub file_missing: bool,
    /// iCloud 未下载占位文件（不打开）
    #[serde(default)]
    pub not_downloaded: bool,
    /// has / none / unknown
    #[serde(default = "default_text_layer")]
    pub text_layer: String,
    /// 知识卡：相对文件名（0..N；P2 才自动填充，P0 只透传）
    #[serde(default)]
    pub knowledge_cards: Vec<String>,
    /// 解析不出标准号的原因，供「未识别」区展示
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unparsed_reason: Option<String>,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub updated_at: String,
}

#[cfg(test)]
impl RegulationRecord {
    /// 最小构造（仅测试用；其余字段走 serde 默认）
    pub fn new(standard_no: impl Into<String>, title: impl Into<String>) -> Self {
        RegulationRecord {
            version: default_version(),
            standard_no: standard_no.into(),
            year: None,
            title: title.into(),
            level: String::new(),
            domains: Vec::new(),
            published_at: None,
            effective_at: None,
            status: String::new(),
            status_overridden: false,
            replaces: Vec::new(),
            file_name: None,
            file_size: None,
            file_missing: false,
            not_downloaded: false,
            text_layer: default_text_layer(),
            knowledge_cards: Vec::new(),
            unparsed_reason: None,
            note: String::new(),
            updated_at: String::new(),
        }
    }
}

fn default_version() -> String {
    "1.0".to_string()
}
fn default_text_layer() -> String {
    "unknown".to_string()
}

/// 受控属性词表（旁路文件持有，用户可增补）
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RegulationVocab {
    #[serde(default = "default_levels")]
    pub levels: Vec<String>,
    #[serde(default = "default_domains")]
    pub domains: Vec<String>,
}

impl Default for RegulationVocab {
    fn default() -> Self {
        Self {
            levels: default_levels(),
            domains: default_domains(),
        }
    }
}

/// 权威查询站点模板（设计 §5.4 / Q26：内置默认 + 旁路文件覆盖）
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SiteTemplate {
    pub name: String,
    /// 适用层级（空 = 全部）
    #[serde(default)]
    pub levels: Vec<String>,
    /// URL 模板，占位符：`{no}` 原始标准号、`{compact}` 去空格、`{lower}` 小写去空格、
    /// `{code}` 去发布机构前缀的代号小写（SAE J3016 → j3016；SAE 规范页只认代号）
    pub url_template: String,
    /// 是否支持自动回填（仅国标 true；其余站点有认证墙/ID 不可推导）
    #[serde(default)]
    pub supports_verify: bool,
}

/// 旁路文件：全库唯一事实源（与公告中心「一条一 JSON」不同，见模块头注释）
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RegulationSidecar {
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub root_path: String,
    #[serde(default)]
    pub vocab: RegulationVocab,
    #[serde(default = "default_sites")]
    pub sites: Vec<SiteTemplate>,
    #[serde(default)]
    pub records: Vec<RegulationRecord>,
}

impl Default for RegulationSidecar {
    fn default() -> Self {
        Self {
            version: default_version(),
            root_path: String::new(),
            vocab: RegulationVocab::default(),
            sites: default_sites(),
            records: Vec::new(),
        }
    }
}

/// 盘上扫描到的、尚未登记的文件（「未识别」区展示用）
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnregisteredFile {
    pub file_name: String,
    pub file_size: u64,
    pub not_downloaded: bool,
    /// 文件名解析出多少算多少（可能为空）
    pub parsed: ParsedName,
}

/// 扫描结果：一条命令给全「记录 + 未登记 + 引用失效」
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RegulationScanResult {
    pub root_exists: bool,
    /// 旁路文件里的记录，已重算 fileMissing / notDownloaded / fileSize
    pub records: Vec<RegulationRecord>,
    pub unregistered: Vec<UnregisteredFile>,
    /// 旁路文件是否存在
    pub sidecar_exists: bool,
}

/// 文件名解析结果
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParsedName {
    /// 规范化标准号；解析不出为空串
    pub standard_no: String,
    /// 发布年份（4 位数字）；解析不出为 null
    pub year: Option<String>,
    /// 标准名称
    pub title: String,
    /// 标准层级（由标准号前缀判定；「政策」为兜底）
    pub level: String,
    /// 稿别标记（征求意见稿/送审稿/报批稿/草案）→ 预填状态「草案」
    #[serde(default)]
    pub marker: Option<String>,
    /// 解析不出标准号时的原因
    pub unparsed_reason: Option<String>,
}

// ==================== 词表默认值 ====================

fn default_levels() -> Vec<String> {
    ["国标", "行标", "团标", "地标", "国际", "政策"]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

/// 主题域种子词表（设计 §4.3，12 项，用户可增补）
fn default_domains() -> Vec<String> {
    [
        "智能驾驶",
        "功能安全",
        "信息安全",
        "软件升级",
        "数据与记录",
        "测试与验证",
        "整车安全与准入",
        "电动车与能量",
        "专用车与物流",
        "无人车与低速",
        "术语与分类",
        "标准体系与政策",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/// 权威查询站点内置默认（实测于 2026-10-08，见设计 §6.1）
fn default_sites() -> Vec<SiteTemplate> {
    vec![
        SiteTemplate {
            name: "全国标准信息公共服务平台".into(),
            levels: vec!["国标".into()],
            url_template: "https://std.samr.gov.cn/gb/search/gbIndexPage?searchText={no}".into(),
            supports_verify: true,
        },
        SiteTemplate {
            name: "行业标准信息服务平台".into(),
            levels: vec!["行标".into()],
            url_template: "https://hbba.sacinfo.org.cn/".into(),
            supports_verify: false,
        },
        SiteTemplate {
            name: "地方标准信息服务平台".into(),
            levels: vec!["地标".into()],
            url_template: "https://dbba.sacinfo.org.cn/".into(),
            supports_verify: false,
        },
        SiteTemplate {
            name: "全国团体标准信息平台".into(),
            levels: vec!["团标".into()],
            url_template: "https://www.ttbz.org.cn/".into(),
            supports_verify: false,
        },
        SiteTemplate {
            name: "ISO".into(),
            levels: vec!["国际".into()],
            // ISO 的 /standard/<数字ID>.html 数字 ID 与标准号无推导关系（设计 §9 留白），
            // 故只给搜索页，不猜 ID
            url_template: "https://www.iso.org/search.html?q={no}".into(),
            supports_verify: false,
        },
        SiteTemplate {
            name: "SAE".into(),
            levels: vec!["国际".into()],
            // SAE 规范页只认代号：实测 …/content/j3016/ 与 …/content/j3016_202104/ 均 200，
            // 而 …/content/saej3016/ 不存在——故必须去掉「SAE」前缀（用 {code} 而非 {lower}）
            url_template: "https://www.sae.org/standards/content/{code}/".into(),
            supports_verify: false,
        },
        SiteTemplate {
            name: "UNECE WP.29".into(),
            levels: vec!["国际".into()],
            url_template: "https://unece.org/transport/vehicle-regulations".into(),
            supports_verify: false,
        },
    ]
}

// ==================== 规范化 ====================

fn tag_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"<[^>]*>").expect("tag regex"))
}

/// 前缀-编号之间的分隔（用于把 `GB-1589` 归一为 `GB 1589`）
fn head_sep_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^([A-Za-z][A-Za-z0-9]*(?:/[A-Za-z]+)*)-(\d)").expect("sep regex")
    })
}

/// 连字符两侧的空白（`GB 1589 - 2016` → `GB 1589-2016`，清洗 SAMR 标签残留的空隙）
fn ws_dash_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\s*-\s*").expect("ws dash regex"))
}

/// 清洗任意标准号文本（SAMR 返回值、用户输入）为规范形态。
///
/// 只做「去噪声」——真正的身份组装在 `parse_file_name`，那里不走启发式。
/// 年份**保留**（如 `GB 1589-2016`）；身份键（去年份）由前端 `identityOf` 负责，
/// 因为需要「去年份」的是用户输入与 P1 的 SAMR 返回值，都在前端侧。
pub fn normalize_standard_no(raw: &str) -> String {
    let mut s = tag_re().replace_all(raw, " ").to_string();
    // 破折号变体统一为 '-'（标准 PDF 常见 — – － −）
    s = s.replace(['—', '–', '－', '−'], "-");
    // 全角空格
    s = s.replace('\u{3000}', " ");
    // 去标签后常留下「 - 」这类空隙，先压掉连字符两侧空白
    s = ws_dash_re().replace_all(&s, "-").to_string();
    s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    // 前缀-编号 之间的 '-' 归一为空格：GB-1589 → GB 1589（年份前的 '-' 不动）
    s = head_sep_re().replace(&s, "$1 $2").to_string();
    s.to_uppercase()
}

/// 前缀归一：把文件名里的紧凑前缀还原为标准写法。
///
/// 语料实测形态：`GBT-`、`DB4403-T-`、`T-SSITS-`、`YZ_T-`、`ISO-SAE-`、`TCSAE-`。
pub fn normalize_prefix(raw: &str) -> String {
    let compact: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_uppercase();
    match compact.as_str() {
        "" => return String::new(),
        "GBT" => return "GB/T".into(),
        "GBZ" => return "GB/Z".into(),
        "GBJ" => return "GB/J".into(),
        "ISOSAE" => return "ISO/SAE".into(),
        "ISOIEC" => return "ISO/IEC".into(),
        "YZT" => return "YZ/T".into(),
        "JTT" => return "JT/T".into(),
        "QCT" => return "QC/T".into(),
        "NYT" => return "NY/T".into(),
        "TBT" => return "TB/T".into(),
        "HGT" => return "HG/T".into(),
        "SYT" => return "SY/T".into(),
        "AQT" => return "AQ/T".into(),
        _ => {}
    }
    // DB<数字>[T]：地标，子类 T 挂斜杠
    if let Some(rest) = compact.strip_prefix("DB") {
        if let Some(num) = rest.strip_suffix('T') {
            if !num.is_empty() && num.chars().all(|c| c.is_ascii_digit()) {
                return format!("DB{num}/T");
            }
        }
        return format!("DB{rest}");
    }
    // T<字母>：团标（TSSITS → T/SSITS、TCSAE → T/CSAE）
    if let Some(rest) = compact.strip_prefix('T') {
        if !rest.is_empty() && rest.chars().all(|c| c.is_ascii_alphabetic()) {
            return format!("T/{rest}");
        }
    }
    compact
}

/// 由标准号前缀判定层级（设计 §4.4）
pub fn derive_level(standard_no: &str) -> String {
    let s = standard_no.trim().to_uppercase();
    let head = s.split([' ', '/']).next().unwrap_or("");
    let level = match head {
        "GB" | "GBZ" | "GBJ" => "国标",
        "T" => "团标",
        "ISO" | "IEC" | "SAE" | "UNECE" | "ECE" | "JAMA" | "AVSC" | "EN" | "DIN" => "国际",
        "GA" | "YZ" | "JT" | "QC" | "CJJ" | "HG" | "SY" | "TB" | "NY" | "AQ" => "行标",
        _ => {
            if head.starts_with("DB") {
                "地标"
            } else if s.starts_with("T/") {
                "团标"
            } else if head.is_empty() {
                "政策"
            } else {
                "政策"
            }
        }
    };
    level.to_string()
}

// ==================== 文件名解析（单源，纯函数） ====================

/// 主正则：`<前缀><分隔><编号>[<分隔><年份>][<分隔><稿别>]<分隔><名称>`
///
/// 前缀懒匹配、且必须后接「分隔符 + 数字」——这一条同时解决了
/// `DB4403-T-357`（前缀吃到 T）、`ISO-SAE-21434`（前缀吃到 SAE）的歧义。
/// 年份后再要求「分隔符或结尾」，不用 lookahead（Rust regex crate 不支持）——
/// 这正是 `SAE-J3016-202104` 的 6 位修订代号不被误当成年份的原因。
fn name_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?x)^
              \s*
              (?P<prefix>
                 DB\d+ (?:[-_]T)?          # 地标：DB4403 / DB4403-T
               | [A-Za-z][A-Za-z/_-]*?     # 其余：前缀不含数字（挡住 SAE-J3016 被整体吃成前缀）
              )
              [-_\s]+
              (?P<num>[A-Za-z]*\d+(?:\.\d+)?)
              (?: [-_\s]+ (?P<year>\d{4}) (?:[-_\s]+|$) )?
              (?: [-_\s]* (?P<marker>征求意见稿|报批稿|送审稿|草案|正式版) )?
              [-_\s]*
              (?P<title>.*)
            $",
        )
        .expect("name regex")
    })
}

/// 标题残留的修订代号（SAE `202104` 这类 6 位）——不是年份，剔除
fn leading_code_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^[0-9]+[-_\s]*").expect("leading code regex"))
}

/// 解析标准文件名 → 标准号/年份/名称/层级/稿别。
///
/// 目标形态：`<前缀>-<编号>[-<年份>]_<名称>.pdf`（语料多数如此）。
/// 解析不出标准号时返回 `unparsed_reason`，**绝不猜**（设计 §9 风险表）。
pub fn parse_file_name(file_name: &str) -> ParsedName {
    let base = file_name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(file_name);

    let Some(caps) = name_re().captures(base) else {
        return ParsedName {
            level: "政策".into(),
            title: base.to_string(),
            unparsed_reason: Some("文件名不符合「标准号_名称」形态（疑似政策文件或过程文件）".into()),
            ..Default::default()
        };
    };

    let prefix_raw = caps.name("prefix").map(|m| m.as_str()).unwrap_or("");
    let num = caps.name("num").map(|m| m.as_str()).unwrap_or("");
    let prefix = normalize_prefix(prefix_raw);
    let standard_no = normalize_standard_no(&format!("{prefix} {num}"));
    let level = derive_level(&standard_no);

    let title = leading_code_re()
        .replace(caps.name("title").map(|m| m.as_str()).unwrap_or(""), "")
        .trim()
        .to_string();

    ParsedName {
        standard_no,
        year: caps.name("year").map(|m| m.as_str().to_string()),
        title,
        level,
        marker: caps.name("marker").map(|m| m.as_str().to_string()),
        unparsed_reason: None,
    }
}

// ==================== 首页预填线索（设计 Q16） ====================

/// 从标准 PDF 首页抽出的预填线索。全部是**建议值**——人工确认后才入库（Q9/Q16）。
#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FirstPageHints {
    pub published_at: Option<String>,
    pub effective_at: Option<String>,
    /// 「代替 GB1589—2004」里的旧标准号
    pub replaces: Vec<String>,
    /// 正文抓到「征求意见稿」等稿别
    pub is_draft: bool,
    /// `has` / `none`——本工具能否从这份 PDF 抽出正文。
    /// `none` 即扫描件：P1 的正文检索覆盖不到它，列表里必须显性标注（Q12 诚实降级）。
    pub text_layer: String,
}

/// 超过此大小不做首页预填：lopdf 要整份解析才能取第 1 页，
/// 大文件（扫描件常达数十 MB）峰值内存可达文件大小 2 倍以上（实测 77MB→170MB）。
/// 预填只是便利，不值得为它把内存预算吃掉。
const HINTS_MAX_BYTES: u64 = 30 * 1024 * 1024;

fn compact_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\s+").expect("compact regex"))
}

/// 去空白版本：lopdf 对部分 PDF 会**逐字符换行**输出（实测 GB 44495 每行一个汉字），
/// 日期与「代替」在这类输出里被空白撕碎，必须先压平再匹配。
fn compact(text: &str) -> String {
    compact_re().replace_all(text, "").to_string()
}

fn iso_date(y: &str, m: &str, d: &str) -> String {
    format!("{y}-{:0>2}-{:0>2}", m, d)
}

/// 日期分隔符：各出版社用的破折号变体五花八门，实测遇到了
/// `-`、`—`(U+2014)、`⁃`(U+2043 HYPHEN BULLET，见 GB 44721)、`－`(全角) 等。
/// 漏掉任何一个都会让那份标准的日期静默抽不出来。
const DSEP: &str = r"[\-—–－−⁃‐‑‒./]";

fn date_then_word_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // 2024-08-23发布 / 2024年8月23日实施（日期在前，动词在后——国标封面形态）
    //
    // 末组 `(日期)?` 用来排除「2024年8月23日 + 实施日期：…」这类跨字段假相邻：
    // 压缩空白后 `…23日实施日期：2026…` 会让本正则误认为 23 日是实施日。
    RE.get_or_init(|| {
        Regex::new(&format!(
            r"(\d{{4}})[年{DSEP}](\d{{1,2}})[月{DSEP}](\d{{1,2}})日?(发布|实施|施行)(日期)?"
        ))
        .expect("date regex")
    })
}

fn word_then_date_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // 「发布日期：2024-08-23」（表格式排布）。**冒号必须存在**——否则封面的
    // 「…发布2026-01-01实施」会被误当成「发布 2026-01-01」。
    RE.get_or_init(|| {
        Regex::new(&format!(
            r"(发布|实施|施行)(?:日期)?[:：]\s*(\d{{4}})[年{DSEP}](\d{{1,2}})[月{DSEP}](\d{{1,2}})"
        ))
        .expect("word date regex")
    })
}

fn replaces_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // 「代替 GB1589-2004」「代替GB/T 34590.1—2017、GB/T 34590.2—2017」
    RE.get_or_init(|| {
        Regex::new(r"代替((?:[^。；;，,]{0,120}))").expect("replaces regex")
    })
}

/// 标准号样式的 token（用于从「代替」后缀里切出旧标准号）。
/// 带分组，便于自行组装规范化标准号（不能直接交给 `normalize_standard_no`：
/// `GB1589-2016` 在它眼里是「前缀含数字」，会被切错）。
/// 年份分隔兼容 `-` 与破折号变体（国标常用 `GB1589—2016`）。
fn std_token_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(GB/T|GB/Z|GB|DB\d+(?:/T)?|T/[A-Z]+|ISO/SAE|ISO/IEC|ISO|IEC|SAE|UNECE|JAMA|AVSC|GA|YZ/T|JT/T|QC/T|CJJ|GBJ|GBZ)\s?(\d+(?:\.\d+)?)(?:[-—–－](\d{4}))?",
        )
        .expect("std token regex")
    })
}

fn draft_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"征求意见稿|送审稿|报批稿|草案").expect("draft regex"))
}

/// 从首页文本抽取预填线索（纯函数，便于测试）。
///
/// 输入应当是**已压缩空白**或未压缩都行——函数内部自行压平。
/// 抽不出就返回 None/空，**绝不猜**（设计 §9 风险表）。
pub fn parse_first_page_hints(raw_text: &str) -> FirstPageHints {
    let t = compact(raw_text);
    let mut hints = FirstPageHints::default();

    // 先跑前缀式（「发布日期：…」），它是唯一能把「实施日期：」里的
    // 「实施」与前面的无关日期解开的形态，优先级更高。
    for caps in word_then_date_re().captures_iter(&t) {
        let date = iso_date(&caps[2], &caps[3], &caps[4]);
        match &caps[1] {
            "发布" => hints.published_at.get_or_insert(date),
            _ => hints.effective_at.get_or_insert(date),
        };
    }
    // 再跑后缀式（国标封面「2024-08-23发布」）；已填的字段不覆盖。
    // 跳过「实施日期」这种本属前缀式的残缺命中（caps[5] 存在）。
    for caps in date_then_word_re().captures_iter(&t) {
        if caps.get(5).is_some() {
            continue;
        }
        let date = iso_date(&caps[1], &caps[2], &caps[3]);
        match &caps[4] {
            "发布" => hints.published_at.get_or_insert(date),
            _ => hints.effective_at.get_or_insert(date),
        };
    }

    // 「代替 XXX」：整段抓出后再用标准号正则切，并自行组装（见 std_token_re 注释）
    if let Some(caps) = replaces_re().captures(&t) {
        let mut seen = HashSet::new();
        for c in std_token_re().captures_iter(&caps[1]) {
            let mut no = format!("{} {}", &c[1], &c[2]);
            if let Some(y) = c.get(3) {
                no = format!("{no}-{}", y.as_str());
            }
            let no = normalize_standard_no(&no);
            if !no.is_empty() && seen.insert(no.clone()) {
                hints.replaces.push(no);
            }
        }
    }

    hints.is_draft = draft_re().is_match(&t);
    hints
}

/// 读取 PDF 首页并抽预填线索。best-effort：读不了/无文本层/过大 → Ok(None)，不报错。
#[tauri::command]
pub async fn extract_regulation_hints(path: String) -> Result<Option<FirstPageHints>, String> {
    tauri::async_runtime::spawn_blocking(move || extract_hints_blocking(&path))
        .await
        .map_err(|e| format!("首页预填任务失败: {e}"))?
}

/// 首页探测的三种结局——**必须区分「扫描件」与「读不出」**：
/// 前者确有文本层可言（只是图像），后者本工具无法判断（lopdf 对部分合法 PDF
/// 会加载失败，如 GB 1589/GB 7258，而它们其实是有文本层的）。
/// 把「读不出」当成「扫描件」就是假阴性——正是本设计要避免的。
enum FirstPageSniff {
    /// 打开成功且有正文
    Text(String),
    /// 打开成功但抽不到文本 → 扫描件
    NoText,
    /// 打不开/太大/未下载 → 无从判断
    Unknown,
}

fn sniff_first_page(bytes: &[u8]) -> FirstPageSniff {
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let doc = match lopdf::Document::load_mem(bytes) {
            Ok(d) => d,
            Err(_) => return FirstPageSniff::Unknown,
        };
        let first: Vec<u32> = doc.get_pages().keys().copied().take(1).collect();
        if first.is_empty() {
            return FirstPageSniff::Unknown;
        }
        match doc.extract_text(&first) {
            Ok(t) if !t.trim().is_empty() => FirstPageSniff::Text(t),
            // 能打开但没文本 → 扫描件
            _ => FirstPageSniff::NoText,
        }
    }));
    r.unwrap_or(FirstPageSniff::Unknown)
}

fn extract_hints_blocking(path: &str) -> Result<Option<FirstPageHints>, String> {
    let p = Path::new(path);
    let meta = match std::fs::metadata(p) {
        Ok(m) => m,
        Err(_) => return Ok(None),
    };
    if meta.len() == 0 || meta.len() > HINTS_MAX_BYTES {
        return Ok(None);
    }
    // iCloud 占位文件不打开（与扫描同口径）
    if is_dataless(&meta) {
        return Ok(None);
    }
    let bytes = match std::fs::read(p) {
        Ok(b) => b,
        Err(_) => return Ok(None),
    };

    match sniff_first_page(&bytes) {
        FirstPageSniff::Text(t) => {
            let mut hints = parse_first_page_hints(&t);
            hints.text_layer = "has".into();
            // 即使没有日期线索也**返回**——`textLayer: "has"` 本身就是有效信息
            Ok(Some(hints))
        }
        FirstPageSniff::NoText => Ok(Some(FirstPageHints {
            text_layer: "none".into(),
            ..Default::default()
        })),
        // 读不出：不给结论，记录保持 `unknown`（比错报成扫描件诚实）
        FirstPageSniff::Unknown => Ok(None),
    }
}

// ==================== IO ====================

fn sidecar_path(root: &str) -> PathBuf {
    Path::new(root).join(SIDECAR_NAME)
}

fn read_sidecar_blocking(root: String) -> Result<RegulationSidecar, String> {
    let path = sidecar_path(&root);
    if !path.exists() {
        return Ok(RegulationSidecar {
            root_path: root,
            ..Default::default()
        });
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("无法读取 {SIDECAR_NAME}: {e}"))?;
    serde_json::from_str::<RegulationSidecar>(&content)
        .map_err(|e| format!("{SIDECAR_NAME} 解析失败（文件可能损坏）: {e}"))
}

/// 读取旁路文件；不存在时返回带默认词表/站点模板的空库（不写盘）
#[tauri::command]
pub async fn read_regulation_sidecar(root: String) -> Result<RegulationSidecar, String> {
    tauri::async_runtime::spawn_blocking(move || read_sidecar_blocking(root))
        .await
        .map_err(|e| format!("读取法规库配置任务失败: {e}"))?
}

fn write_sidecar_blocking(root: String, mut sidecar: RegulationSidecar) -> Result<String, String> {
    let dir = Path::new(&root);
    if !dir.exists() {
        std::fs::create_dir_all(dir).map_err(|e| format!("无法创建法规库目录 {root}: {e}"))?;
    }
    sidecar.root_path = root.clone();
    sidecar.version = default_version();
    let path = sidecar_path(&root);
    let body =
        serde_json::to_string_pretty(&sidecar).map_err(|e| format!("序列化法规库配置失败: {e}"))?;
    std::fs::write(&path, body).map_err(|e| format!("无法写入 {SIDECAR_NAME}: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

/// 整库写入（单文件旁路，一次 IPC 覆盖全量——与公告中心 N 次 writeTextFile 不同）
#[tauri::command]
pub async fn write_regulation_sidecar(
    root: String,
    sidecar: RegulationSidecar,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || write_sidecar_blocking(root, sidecar))
        .await
        .map_err(|e| format!("写入法规库配置任务失败: {e}"))?
}

/// iCloud 未下载占位文件判定：`blocks() == 0`（同 pdf_sniff 做法，不打开文件）
#[cfg(unix)]
fn is_dataless(meta: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    meta.blocks() == 0 && meta.len() > 0
}
#[cfg(not(unix))]
fn is_dataless(_meta: &std::fs::Metadata) -> bool {
    false
}

/// 噪声目录：与 pdf_sniff 同口径（点目录、下划线目录、系统目录）
fn is_noise_dir(name: &str) -> bool {
    name.starts_with('.')
        || name.starts_with('_')
        || matches!(
            name,
            "Library" | "node_modules" | "$RECYCLE.BIN" | "System Volume Information" | "AppData"
        )
}

fn scan_blocking(root: String, max_depth: usize) -> Result<RegulationScanResult, String> {
    let root_path = Path::new(&root);
    if !root_path.exists() {
        return Ok(RegulationScanResult {
            root_exists: false,
            records: Vec::new(),
            unregistered: Vec::new(),
            sidecar_exists: false,
        });
    }
    let sidecar_exists = sidecar_path(&root).exists();
    let mut sidecar = read_sidecar_blocking(root.clone())?;

    // 收集盘上 PDF
    struct OnDisk {
        size: u64,
        not_downloaded: bool,
    }
    let mut on_disk: Vec<(String, OnDisk)> = Vec::new();
    let walker = walkdir::WalkDir::new(root_path)
        .max_depth(max_depth)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.file_type().is_dir() && e.depth() > 0 {
                return !is_noise_dir(&e.file_name().to_string_lossy());
            }
            true
        });
    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().ends_with(".pdf") {
            continue;
        }
        // 相对根目录的路径（记录里存相对名，便于库整体搬迁）
        let rel = entry
            .path()
            .strip_prefix(root_path)
            .unwrap_or_else(|_| entry.path())
            .to_string_lossy()
            .replace('\\', "/");
        let (size, dataless) = match entry.metadata() {
            Ok(m) => (m.len(), is_dataless(&m)),
            Err(_) => (0, false),
        };
        on_disk.push((
            rel,
            OnDisk {
                size,
                not_downloaded: dataless,
            },
        ));
    }

    let disk_by_name: std::collections::HashMap<&str, &OnDisk> =
        on_disk.iter().map(|(n, m)| (n.as_str(), m)).collect();

    // 重算记录的引用状态
    let mut claimed: HashSet<String> = HashSet::new();
    for rec in sidecar.records.iter_mut() {
        match rec.file_name.as_deref() {
            Some(fname) if !fname.is_empty() => match disk_by_name.get(fname) {
                Some(m) => {
                    rec.file_missing = false;
                    rec.not_downloaded = m.not_downloaded;
                    rec.file_size = Some(m.size);
                    claimed.insert(fname.to_string());
                }
                None => {
                    rec.file_missing = true;
                    rec.not_downloaded = false;
                }
            },
            // 无 PDF 是合法状态（Q8），不是失效
            _ => {
                rec.file_missing = false;
                rec.not_downloaded = false;
            }
        }
    }

    // 未登记文件
    let mut unregistered: Vec<UnregisteredFile> = on_disk
        .iter()
        .filter(|(n, _)| !claimed.contains(n))
        .map(|(n, m)| {
            let base = n.rsplit('/').next().unwrap_or(n);
            UnregisteredFile {
                file_name: n.clone(),
                file_size: m.size,
                not_downloaded: m.not_downloaded,
                parsed: parse_file_name(base),
            }
        })
        .collect();
    unregistered.sort_by(|a, b| a.file_name.cmp(&b.file_name));

    Ok(RegulationScanResult {
        root_exists: true,
        records: sidecar.records,
        unregistered,
        sidecar_exists,
    })
}

/// 扫描法规库：读旁路文件 + 遍历目录 + 重算引用状态 + 列出未登记文件
#[tauri::command]
pub async fn scan_regulations(
    root: String,
    max_depth: Option<u32>,
) -> Result<RegulationScanResult, String> {
    let depth = max_depth
        .map(|d| d as usize)
        .unwrap_or(DEFAULT_MAX_DEPTH)
        .clamp(1, 16);
    tauri::async_runtime::spawn_blocking(move || scan_blocking(root, depth))
        .await
        .map_err(|e| format!("扫描法规库任务失败: {e}"))?
}

// ==================== 测试 ====================

#[cfg(test)]
mod tests {
    use super::*;

    // ---------- 规范化与层级 ----------

    #[test]
    fn normalize_handles_dash_variants() {
        assert_eq!(normalize_standard_no("GB-1589"), "GB 1589");
        assert_eq!(normalize_standard_no("GB 1589"), "GB 1589");
        assert_eq!(normalize_standard_no("gb 1589"), "GB 1589");
    }

    #[test]
    fn normalize_unifies_em_dash_and_keeps_year() {
        // 标准 PDF 里常见 em dash；年份必须保留（身份键的「去年份」在前端 identityOf）
        assert_eq!(normalize_standard_no("GB 1589—2016"), "GB 1589-2016");
        assert_eq!(normalize_standard_no("GB 1589-2016"), "GB 1589-2016");
    }

    #[test]
    fn normalize_strips_sacinfo_tags() {
        let raw = "<sacinfo>GB</sacinfo> <sacinfo>1589</sacinfo>-2026";
        let got = normalize_standard_no(raw);
        assert_eq!(got, "GB 1589-2026");
        assert!(!got.contains("sacinfo"));
    }

    #[test]
    fn normalize_prefix_recovers_standard_forms() {
        assert_eq!(normalize_prefix("GBT"), "GB/T");
        assert_eq!(normalize_prefix("GBZ"), "GB/Z");
        assert_eq!(normalize_prefix("GB"), "GB");
        assert_eq!(normalize_prefix("DB4403-T"), "DB4403/T");
        assert_eq!(normalize_prefix("DB4403"), "DB4403");
        assert_eq!(normalize_prefix("T-SSITS"), "T/SSITS");
        assert_eq!(normalize_prefix("T_SSITS"), "T/SSITS");
        assert_eq!(normalize_prefix("TCSAE"), "T/CSAE");
        assert_eq!(normalize_prefix("YZ_T"), "YZ/T");
        assert_eq!(normalize_prefix("ISO-SAE"), "ISO/SAE");
        assert_eq!(normalize_prefix("SAE"), "SAE");
    }

    #[test]
    fn derive_level_by_prefix() {
        assert_eq!(derive_level("GB 44495"), "国标");
        assert_eq!(derive_level("GB/T 18386.1"), "国标");
        assert_eq!(derive_level("DB4403/T 357"), "地标");
        assert_eq!(derive_level("T/SSITS 2001"), "团标");
        assert_eq!(derive_level("ISO 26262"), "国际");
        assert_eq!(derive_level("ISO/SAE 21434"), "国际");
        assert_eq!(derive_level("SAE J3016"), "国际");
        assert_eq!(derive_level("GA 802"), "行标");
        assert_eq!(derive_level("YZ/T 0182"), "行标");
        assert_eq!(derive_level("CJJ 37"), "行标");
    }

    // ---------- 文件名解析（全部取自真实语料） ----------

    #[test]
    fn parses_plain_national_standard() {
        let p = parse_file_name("GB-44495-2024_汽车整车信息安全技术要求.pdf");
        assert_eq!(p.standard_no, "GB 44495");
        assert_eq!(p.year.as_deref(), Some("2024"));
        assert_eq!(p.title, "汽车整车信息安全技术要求");
        assert_eq!(p.level, "国标");
        assert_eq!(p.marker, None);
        assert!(p.unparsed_reason.is_none());
    }

    #[test]
    fn parses_gbt_with_part_number() {
        let p = parse_file_name("GBT-18386.1-2021_电动汽车能量消耗量和续驶里程试验方法 第1部分 轻型汽车.pdf");
        assert_eq!(p.standard_no, "GB/T 18386.1");
        assert_eq!(p.year.as_deref(), Some("2021"));
        assert_eq!(p.level, "国标");
    }

    #[test]
    fn part_numbers_stay_distinct() {
        let a = parse_file_name("GBT-18386.1-2021_甲.pdf");
        let b = parse_file_name("GBT-18386.2-2022_乙.pdf");
        assert_ne!(a.standard_no, b.standard_no, "部分号必须是不同身份（Q5）");
    }

    #[test]
    fn parses_draft_marks_marker_and_no_year() {
        let p = parse_file_name("GBT-34590.1-征求意见稿_道路车辆 功能安全 第1部分：术语.pdf");
        assert_eq!(p.standard_no, "GB/T 34590.1");
        assert_eq!(p.year, None, "「征求意见稿」不是年份");
        assert_eq!(p.marker.as_deref(), Some("征求意见稿"));
        assert_eq!(p.title, "道路车辆 功能安全 第1部分：术语");
        assert_eq!(p.level, "国标");
    }

    #[test]
    fn parses_local_standard_with_t_subclass() {
        let d = parse_file_name("DB4403-T-357-2023_智能网联汽车软件升级技术要求.pdf");
        assert_eq!(d.standard_no, "DB4403/T 357");
        assert_eq!(d.year.as_deref(), Some("2023"));
        assert_eq!(d.level, "地标");
    }

    #[test]
    fn parses_group_standards_both_forms() {
        let a = parse_file_name("T-SSITS-2001-2022_低速无人车移动底盘通用技术条件.pdf");
        assert_eq!(a.standard_no, "T/SSITS 2001");
        assert_eq!(a.year.as_deref(), Some("2022"));
        assert_eq!(a.level, "团标");

        let b = parse_file_name("TCSAE-286.2-2022_功能型无人车-第2部分：总体技术要求.pdf");
        assert_eq!(b.standard_no, "T/CSAE 286.2");
        assert_eq!(b.year.as_deref(), Some("2022"));
        assert_eq!(b.level, "团标");
    }

    #[test]
    fn parses_row_standard_with_underscore_prefix() {
        let p = parse_file_name("YZ_T-0182-2022_寄递无人车技术要求.pdf");
        assert_eq!(p.standard_no, "YZ/T 0182");
        assert_eq!(p.year.as_deref(), Some("2022"));
        assert_eq!(p.level, "行标");
    }

    #[test]
    fn parses_multi_prefix_international() {
        let p = parse_file_name("ISO-SAE-21434-2021_道路车辆 网络安全工程.pdf");
        assert_eq!(p.standard_no, "ISO/SAE 21434");
        assert_eq!(p.year.as_deref(), Some("2021"));
        assert_eq!(p.level, "国际");
    }

    #[test]
    fn iso_without_slash_type() {
        let p = parse_file_name("ISO-21448_预期功能安全SOTIF.pdf");
        assert_eq!(p.standard_no, "ISO 21448");
        assert_eq!(p.year, None);
        assert_eq!(p.title, "预期功能安全SOTIF");
        assert_eq!(p.level, "国际");
    }

    #[test]
    fn sae_revision_code_is_not_a_year() {
        // SAE J3016-202104：202104 是修订代号（6 位），不是年份
        let p = parse_file_name("SAE-J3016-202104_驾驶自动化分级.pdf");
        assert_eq!(p.standard_no, "SAE J3016");
        assert_eq!(p.year, None, "6 位修订代号不是年份");
        assert_eq!(p.level, "国际");
        assert!(!p.title.starts_with("2021"), "修订代号不应残留进标题: {}", p.title);
    }

    #[test]
    fn parses_ga_row_standard() {
        let p = parse_file_name("GA-802-2019_机动车类型 术语和定义.pdf");
        assert_eq!(p.standard_no, "GA 802");
        assert_eq!(p.year.as_deref(), Some("2019"));
        assert_eq!(p.level, "行标");
    }

    #[test]
    fn parses_cjj_engineering_standard() {
        let p = parse_file_name("CJJ-37-2012_城市道路工程设计规范.pdf");
        assert_eq!(p.standard_no, "CJJ 37");
        assert_eq!(p.year.as_deref(), Some("2012"));
        assert_eq!(p.level, "行标");
    }

    #[test]
    fn parses_dotted_energy_standard() {
        let p = parse_file_name("GB-36980.1-2025_电动汽车能量消耗量限值 第1部分 乘用车.pdf");
        assert_eq!(p.standard_no, "GB 36980.1");
        assert_eq!(p.year.as_deref(), Some("2025"));
    }

    // ---------- 未识别（绝不猜） ----------

    #[test]
    fn unknown_number_is_reported_not_guessed() {
        let p = parse_file_name("汽车数据通用要求（无标准号·扫描件）.pdf");
        assert_eq!(p.standard_no, "");
        assert!(p.unparsed_reason.is_some(), "解析不出必须给原因，不能猜");
    }

    #[test]
    fn chinese_titled_files_are_unrecognized() {
        for f in [
            "国家车联网产业标准体系建设指南-智能网联汽车-2023版.pdf",
            "关于开展功能型无人车标准法规政策研究的通知.pdf",
            "功能型无人小车基础技术要求项目建议书.pdf",
            "中邮证券_无人车行业研究.pdf",
            "自动驾驶系统设计运行条件白皮书-全国汽车标准化技术委员会.pdf",
        ] {
            let p = parse_file_name(f);
            assert!(
                p.unparsed_reason.is_some(),
                "{f} 应进「未识别」，却被解析成 {:?}",
                p.standard_no
            );
        }
    }

    #[test]
    fn framework_docs_without_number_are_unrecognized() {
        // AVSC/JAMA/UNECE 的框架文件没有编号——诚实进未识别，不硬塞层级
        for f in ["AVSC-ODD框架.pdf", "JAMA-ADS框架.pdf", "UNECE-ADS框架.pdf"] {
            let p = parse_file_name(f);
            assert!(p.unparsed_reason.is_some(), "{f} 无编号应进未识别");
        }
    }

    #[test]
    fn title_containing_dash_is_preserved() {
        let p = parse_file_name("ISO-22737-2021_预定路线低速自动驾驶系统-中英对照.pdf");
        assert_eq!(p.standard_no, "ISO 22737");
        assert_eq!(p.year.as_deref(), Some("2021"));
        assert_eq!(p.title, "预定路线低速自动驾驶系统-中英对照");
    }

    // ---------- 真实语料回归（文件名取自 2026-10-08 实测的法规库） ----------
    //
    // 这是本模块最重要的测试：解析规则若改动导致这批真实文件名回归，
    // 必须在这里暴露，而不是等到用户导入时才发现。

    #[test]
    fn real_corpus_standards_all_parse() {
        // (文件名, 期望标准号, 期望年份, 期望层级)
        let cases: &[(&str, &str, Option<&str>, &str)] = &[
            ("GB-39901-2025_轻型汽车自动紧急制动系统技术要求及试验方法.pdf", "GB 39901", Some("2025"), "国标"),
            ("GB-44495-2024_汽车整车信息安全技术要求.pdf", "GB 44495", Some("2024"), "国标"),
            ("GB-44496-2024_汽车软件升级通用技术要求.pdf", "GB 44496", Some("2024"), "国标"),
            ("GB-44497-2024_智能网联汽车 自动驾驶数据记录系统.pdf", "GB 44497", Some("2024"), "国标"),
            ("GB-44721-2026_智能网联汽车 自动驾驶系统安全要求.pdf", "GB 44721", Some("2026"), "国标"),
            ("GB-47955-2026_智能网联汽车 组合驾驶辅助系统安全要求.pdf", "GB 47955", Some("2026"), "国标"),
            ("GBT-40429-2021_汽车驾驶自动化分级.pdf", "GB/T 40429", Some("2021"), "国标"),
            ("GBT-40861-2021_汽车信息安全通用技术要求.pdf", "GB/T 40861", Some("2021"), "国标"),
            ("GBT-41798-2022_智能网联汽车 自动驾驶功能场地试验方法及要求.pdf", "GB/T 41798", Some("2022"), "国标"),
            ("GBT-43119-2023_自动驾驶封闭测试场地建设技术要求.pdf", "GB/T 43119", Some("2023"), "国标"),
            ("ISO-21448_预期功能安全SOTIF.pdf", "ISO 21448", None, "国际"),
            ("ISO-22737-2021_预定路线低速自动驾驶系统-中英对照.pdf", "ISO 22737", Some("2021"), "国际"),
            ("ISO-34501-2022_道路车辆 自动驾驶系统测试场景-词汇.pdf", "ISO 34501", Some("2022"), "国际"),
            ("ISO-SAE-21434-2021_道路车辆 网络安全工程.pdf", "ISO/SAE 21434", Some("2021"), "国际"),
            ("SAE-J3016-202104_驾驶自动化分级.pdf", "SAE J3016", None, "国际"),
            ("GA-802-2019_机动车类型 术语和定义.pdf", "GA 802", Some("2019"), "行标"),
            ("GB-1589-2016_汽车 挂车及汽车列车外廓尺寸 轴荷及质量限值.pdf", "GB 1589", Some("2016"), "国标"),
            ("GB-21670-2025_乘用车制动系统技术要求及试验方法.pdf", "GB 21670", Some("2025"), "国标"),
            ("GB-29753-2023_道路运输 易腐食品与生物制品 冷藏车安全要求及试验方法.pdf", "GB 29753", Some("2023"), "国标"),
            ("GB-36980.1-2025_电动汽车能量消耗量限值 第1部分 乘用车.pdf", "GB 36980.1", Some("2025"), "国标"),
            ("GB-4785-2019_汽车及挂车外部照明和光信号装置的安装规定.pdf", "GB 4785", Some("2019"), "国标"),
            ("GB-5920-2024_汽车和挂车光信号装置及系统.pdf", "GB 5920", Some("2024"), "国标"),
            ("GB-7258-2017_机动车运行安全技术条件.pdf", "GB 7258", Some("2017"), "国标"),
            ("GBT-12673-2019_汽车主要尺寸测量方法.pdf", "GB/T 12673", Some("2019"), "国标"),
            ("GBT-17350-2024_专用汽车分类 名称及型号编制方法.pdf", "GB/T 17350", Some("2024"), "国标"),
            ("GBT-18386.1-2021_电动汽车能量消耗量和续驶里程试验方法 第1部分 轻型汽车.pdf", "GB/T 18386.1", Some("2021"), "国标"),
            ("GBT-18386.2-2022_电动汽车能量消耗量和续驶里程试验方法 第2部分 重型商用车辆.pdf", "GB/T 18386.2", Some("2022"), "国标"),
            ("GBT-29912-2024_城市物流配送汽车选型技术要求.pdf", "GB/T 29912", Some("2024"), "国标"),
            ("GBT-43974-2024_载物电气运输设备通用规范.pdf", "GB/T 43974", Some("2024"), "国标"),
            ("GBT-44500-2024_新能源汽车运行安全性能检验规程.pdf", "GB/T 44500", Some("2024"), "国标"),
            ("GBT-5620-2020_道路车辆 汽车和挂车制动名词术语及其定义.pdf", "GB/T 5620", Some("2020"), "国标"),
            ("CJJ-37-2012_城市道路工程设计规范.pdf", "CJJ 37", Some("2012"), "行标"),
            ("YZ_T-0182-2022_寄递无人车技术要求.pdf", "YZ/T 0182", Some("2022"), "行标"),
            ("T-SSITS-2001-2022_低速无人车移动底盘通用技术条件.pdf", "T/SSITS 2001", Some("2022"), "团标"),
            ("T-SSITS-2006-2024_面向特定场景低速自动驾驶产品准入及运营规范.pdf", "T/SSITS 2006", Some("2024"), "团标"),
            ("TCSAE-286.2-2022_功能型无人车-第2部分：总体技术要求.pdf", "T/CSAE 286.2", Some("2022"), "团标"),
            ("DB4403-T-357-2023_智能网联汽车软件升级技术要求.pdf", "DB4403/T 357", Some("2023"), "地标"),
        ];
        for (file, no, year, level) in cases {
            let p = parse_file_name(file);
            assert_eq!(&p.standard_no, no, "标准号错: {file}");
            assert_eq!(p.year.as_deref(), *year, "年份错: {file}");
            assert_eq!(&p.level, level, "层级错: {file}");
            assert!(p.unparsed_reason.is_none(), "不该进未识别: {file}");
        }
    }

    #[test]
    fn real_corpus_drafts_and_process_files() {
        // 稿别标记：草案要能被识别（预填 status=草案）
        let draft = parse_file_name("GBT-34590.1-征求意见稿_道路车辆 功能安全 第1部分：术语.pdf");
        assert_eq!(draft.standard_no, "GB/T 34590.1");
        assert_eq!(draft.marker.as_deref(), Some("征求意见稿"));
        assert_eq!(draft.year, None);

        // 过程文件/政策/报告：进未识别，绝不硬塞标准号
        for f in [
            "汽车数据通用要求（无标准号·扫描件）.pdf",
            "AVSC-ODD框架.pdf",
            "JAMA-ADS框架.pdf",
            "UNECE-ADS框架.pdf",
            "国家车联网产业标准体系建设指南-智能网联汽车-2023版.pdf",
            "自动驾驶系统设计运行条件白皮书-全国汽车标准化技术委员会.pdf",
            "中邮证券_无人车行业研究.pdf",
            "关于开展功能型无人车标准法规政策研究的通知.pdf",
            "功能型无人小车基础技术要求项目建议书.pdf",
            "深圳市汽车产业联合会关于公开征集团体标准专家库专家的通知.pdf",
        ] {
            let p = parse_file_name(f);
            assert!(p.unparsed_reason.is_some(), "应进未识别却被解析: {f} -> {}", p.standard_no);
        }
    }

    #[test]
    fn real_corpus_identity_is_stable_across_versions() {
        // 同一标准号的不同版本必须归到同一身份（Q5 / Q6 版本链的前提）
        let old = parse_file_name("GB-1589-2016_汽车 挂车及汽车列车外廓尺寸 轴荷及质量限值.pdf");
        let new = parse_file_name("GB-1589-2026_汽车、挂车及汽车列车外廓尺寸、轴荷及质量限值.pdf");
        assert_eq!(old.standard_no, new.standard_no, "年份不同但身份必须一致");
        assert_ne!(old.year, new.year);
    }

    // ---------- 词表与站点默认值 ----------

    #[test]
    fn default_vocab_has_seed_domains() {
        let v = RegulationVocab::default();
        assert_eq!(v.levels.len(), 6);
        assert_eq!(v.domains.len(), 12, "设计 §4.3 定的是 12 项种子词表");
        assert!(v.domains.contains(&"智能驾驶".to_string()));
        assert!(v.domains.contains(&"标准体系与政策".to_string()));
    }

    #[test]
    fn only_national_standard_supports_verify() {
        let sites = default_sites();
        let verify: Vec<&str> = sites
            .iter()
            .filter(|s| s.supports_verify)
            .map(|s| s.name.as_str())
            .collect();
        assert_eq!(
            verify,
            vec!["全国标准信息公共服务平台"],
            "只有国标能自动回填（设计 §5.4 / Q24）"
        );
    }

    // ---------- 旁路文件往返 ----------

    #[test]
    fn sidecar_roundtrip_preserves_records() {
        let mut sc = RegulationSidecar::default();
        let mut rec = RegulationRecord::new("GB 1589", "汽车、挂车及汽车列车外廓尺寸、轴荷及质量限值");
        rec.year = Some("2016".into());
        rec.level = "国标".into();
        rec.domains = vec!["整车安全与准入".into()];
        rec.file_name = Some("03_整车准入-国标/GB-1589-2016_x.pdf".into());
        sc.records.push(rec);

        let json = serde_json::to_string(&sc).unwrap();
        let back: RegulationSidecar = serde_json::from_str(&json).unwrap();
        assert_eq!(back.records.len(), 1);
        assert_eq!(back.records[0].standard_no, "GB 1589");
        assert_eq!(back.records[0].text_layer, "unknown", "缺省字段应有默认值");
        assert_eq!(back.vocab.domains.len(), 12, "缺省词表应回落到种子值");
        assert_eq!(back.sites.len(), 7, "缺省站点模板应回落");
    }

    #[test]
    fn sidecar_tolerates_missing_optional_fields() {
        // 只给必填字段——旧版本写入的旁路文件不应导致整库读不出
        let minimal = r#"{"records":[{"standardNo":"ISO 26262","title":"道路车辆功能安全"}]}"#;
        let sc: RegulationSidecar = serde_json::from_str(minimal).unwrap();
        assert_eq!(sc.version, "1.0");
        assert_eq!(sc.records[0].level, "");
        assert!(sc.records[0].domains.is_empty());
        assert!(!sc.records[0].file_missing);
    }

    // ---------- 首页预填线索（Q16） ----------

    #[test]
    fn hints_date_then_word_form() {
        // 国标封面形态：日期在前、动词在后（实测 GB 1589-2016 / GB 44495-2024）
        let t = "ICS43.020CCST40 中华人民共和国国家标准 GB44495—2024 汽车整车信息安全技术要求 2024-08-23发布 2026-01-01实施 国家市场监督管理总局 国家标准化管理委员会发布";
        let h = parse_first_page_hints(t);
        assert_eq!(h.published_at.as_deref(), Some("2024-08-23"));
        assert_eq!(h.effective_at.as_deref(), Some("2026-01-01"));
    }

    #[test]
    fn hints_accepts_exotic_dash_variants() {
        // 实测 GB 44721-2026 用的是 U+2043 HYPHEN BULLET（⁃），漏了它这份标准日期就抽不出
        let t = "GB44721—2026 2026 ⁃ 07 ⁃ 30 发布 2027 ⁃ 07 ⁃ 01 实施";
        let h = parse_first_page_hints(t);
        assert_eq!(h.published_at.as_deref(), Some("2026-07-30"));
        assert_eq!(h.effective_at.as_deref(), Some("2027-07-01"));
        // em dash 版（多数国标）
        let t2 = "2026—07—30发布 2027—07—01实施";
        let h2 = parse_first_page_hints(t2);
        assert_eq!(h2.published_at.as_deref(), Some("2026-07-30"));
        assert_eq!(h2.effective_at.as_deref(), Some("2027-07-01"));
    }

    #[test]
    fn hints_word_then_date_form() {
        // 表格式排布：动词在前
        let t = "发布日期：2024年8月23日  实施日期：2026年1月1日";
        let h = parse_first_page_hints(t);
        assert_eq!(h.published_at.as_deref(), Some("2024-08-23"));
        assert_eq!(h.effective_at.as_deref(), Some("2026-01-01"));
    }

    #[test]
    fn hints_survive_per_glyph_line_breaks() {
        // lopdf 对部分 PDF 逐字符换行输出——日期被空白撕碎，必须先压平
        let t = "2 \n0 \n2 \n4 \n- \n0 \n8 \n- \n2 \n3 \n发 \n布 \n2 \n0 \n2 \n6 \n- \n0 \n1 \n- \n0 \n1 \n实 \n施";
        let h = parse_first_page_hints(t);
        assert_eq!(h.published_at.as_deref(), Some("2024-08-23"));
        assert_eq!(h.effective_at.as_deref(), Some("2026-01-01"));
    }

    #[test]
    fn hints_replaces_single() {
        let t = "GB1589—2026 汽车、挂车及汽车列车外廓尺寸、轴荷及质量限值 代替GB1589—2016";
        let h = parse_first_page_hints(t);
        assert_eq!(h.replaces, vec!["GB 1589-2016".to_string()]);
    }

    #[test]
    fn hints_replaces_multiple_separated() {
        let t = "代替GB/T34590.1—2017、GB/T34590.2—2017";
        let h = parse_first_page_hints(t);
        assert_eq!(h.replaces, vec!["GB/T 34590.1-2017".to_string(), "GB/T 34590.2-2017".to_string()]);
    }

    #[test]
    fn hints_ignores_heading_mentioning_replace() {
        // 目次里的「代替」不是替代关系——不该抓出一堆乱码
        let t = "目次 前言 Ⅲ 1范围 2规范性引用文件 3术语和定义 … 本文件代替GB44495—2018，与GB44495—2018相比";
        let h = parse_first_page_hints(t);
        assert_eq!(h.replaces, vec!["GB 44495-2018".to_string()]);
    }

    #[test]
    fn hints_deduplicates_replaces() {
        let t = "代替GB1589—2016 全部代替GB1589—2016";
        let h = parse_first_page_hints(t);
        assert_eq!(h.replaces.len(), 1, "同一旧标准号不应重复");
    }

    #[test]
    fn hints_detects_draft() {
        let t = "道路车辆 功能安全 第1部分：术语 征求意见稿";
        assert!(parse_first_page_hints(t).is_draft);
        assert!(!parse_first_page_hints("中华人民共和国国家标准 GB 44495—2024").is_draft);
    }

    #[test]
    fn hints_empty_when_nothing_found() {
        // 抽不出就什么都不给，绝不猜（设计 §9）
        let h = parse_first_page_hints("这是一份没有任何日期或替代信息的扫描件文本层");
        assert_eq!(h.published_at, None);
        assert_eq!(h.effective_at, None);
        assert!(h.replaces.is_empty());
        assert!(!h.is_draft);
    }

    #[test]
    fn hints_do_not_confuse_other_dates() {
        // 只认带「发布/实施/施行」的日期，正文里的日期不该被当成发布日期
        let t = "GB 12345—2020 某标准 2020-01-01发布 某试验方法适用于2015-06-01以后生产的车辆";
        let h = parse_first_page_hints(t);
        assert_eq!(h.published_at.as_deref(), Some("2020-01-01"));
        assert_eq!(h.effective_at, None, "正文里的日期不该被当成实施日期");
    }

    #[test]
    fn hints_handles_em_dash_in_replaces() {
        let t = "代替GB/T34590.1—2021";
        let h = parse_first_page_hints(t);
        assert_eq!(h.replaces, vec!["GB/T 34590.1-2021".to_string()]);
    }

    #[test]
    fn sniff_garbage_bytes_is_unknown_not_scanned() {
        // 关键区分：读不出 ≠ 扫描件。把读不出当成扫描件就是假阴性
        //（lopdf 对 GB 1589/GB 7258 这类合法 PDF 会加载失败，而它们其实有文本层）
        assert!(matches!(sniff_first_page(b"not a pdf at all"), FirstPageSniff::Unknown));
        assert!(matches!(sniff_first_page(b""), FirstPageSniff::Unknown));
    }

    #[test]
    fn text_layer_serializes_for_record() {
        // 记录里 textLayer 的取值必须与 TS 侧字符串一致（has/none/unknown）
        let h = FirstPageHints {
            text_layer: "none".into(),
            ..Default::default()
        };
        let j = serde_json::to_string(&h).unwrap();
        assert!(j.contains("\"textLayer\":\"none\""), "got {j}");
    }

    /// 真机探针：对真实 PDF 跑首页预填，打印抽出什么。
    /// 手动运行：`cargo test --lib probe_real_hints -- --ignored --nocapture`
    #[test]
    #[ignore = "需要本机真实法规库；手动运行"]
    fn probe_real_hints() {
        let root = std::env::var("REGULATION_LIB")
            .unwrap_or_else(|_| "/Users/ethan/Library/Mobile Documents/com~apple~CloudDocs/👨个人知识库/【02】Areas/无人车/20-研究/行业情报/法规标准".to_string());
        let files = [
            "01_智能驾驶-国标/GB-44495-2024_汽车整车信息安全技术要求.pdf",
            "01_智能驾驶-国标/GB-44721-2026_智能网联汽车 自动驾驶系统安全要求.pdf",
            "03_整车准入-国标/GB-1589-2016_汽车 挂车及汽车列车外廓尺寸 轴荷及质量限值.pdf",
            "03_整车准入-国标/GB-7258-2017_机动车运行安全技术条件.pdf",
            "01_智能驾驶-国标/GBT-34590.1-征求意见稿_道路车辆 功能安全 第1部分：术语.pdf",
            "01_智能驾驶-国标/GBT-41798-2022_智能网联汽车 自动驾驶功能场地试验方法及要求.pdf",
        ];
        println!("\n=== 真实 PDF 首页预填 ===");
        for rel in files {
            let full = Path::new(&root).join(rel);
            let name = rel.rsplit('/').next().unwrap_or(rel);
            match extract_hints_blocking(&full.to_string_lossy()) {
                Ok(Some(h)) => println!(
                    "  {name}\n      文本层={:<7} 发布={:?} 实施={:?} 代替={:?} 草案={}",
                    h.text_layer, h.published_at, h.effective_at, h.replaces, h.is_draft
                ),
                Ok(None) => println!("  {name}\n      读不出（lopdf 加载失败/过大/未下载）→ textLayer 保持 unknown"),
                Err(e) => println!("  {name}\n      错误: {e}"),
            }
        }
    }

    /// 真机探针：对真实法规库跑一遍解析，打印覆盖率与未识别清单。
    /// 路径不存在时自动跳过（CI/他人机器不会红）。
    /// 手动运行：`cargo test --lib probe_real_library -- --ignored --nocapture`
    #[test]
    #[ignore = "需要本机真实法规库；手动运行"]
    fn probe_real_library() {
        let root = std::env::var("REGULATION_LIB")
            .unwrap_or_else(|_| "/Users/ethan/Library/Mobile Documents/com~apple~CloudDocs/👨个人知识库/【02】Areas/无人车/20-研究/行业情报/法规标准".to_string());
        let root = Path::new(&root);
        if !root.exists() {
            eprintln!("跳过：{root:?} 不存在");
            return;
        }
        let result = scan_blocking(root.to_string_lossy().to_string(), DEFAULT_MAX_DEPTH).unwrap();
        let total = result.unregistered.len();
        let parsed: Vec<_> = result
            .unregistered
            .iter()
            .filter(|f| f.parsed.unparsed_reason.is_none())
            .collect();
        println!("\n=== 真实库解析覆盖 ===");
        println!("文件总数 {}", total);
        println!(
            "解析出标准号 {} ({:.0}%)",
            parsed.len(),
            if total == 0 { 0.0 } else { parsed.len() as f64 * 100.0 / total as f64 }
        );
        println!("\n--- 未识别（{}）---", total - parsed.len());
        for f in result.unregistered.iter().filter(|f| f.parsed.unparsed_reason.is_some()) {
            println!("  {}", f.file_name);
        }
        println!("\n--- 已解析（按层级）---");
        for f in &parsed {
            println!(
                "  [{:>4}] {:<20} {:<6} {}",
                f.parsed.level, f.parsed.standard_no, f.parsed.year.as_deref().unwrap_or("—"), f.parsed.title
            );
        }
    }

    #[test]
    fn noise_dir_filter() {
        assert!(is_noise_dir(".alma-snapshots"));
        assert!(is_noise_dir("_源文件"));
        assert!(!is_noise_dir("01_智能驾驶-国标"));
        assert!(!is_noise_dir("08_标准知识卡"));
    }
}
