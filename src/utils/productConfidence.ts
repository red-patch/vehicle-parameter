/**
 * 产品置信度评分模块
 * 用于识别解析出的"产品"是否为真正的车型配置
 */

// 黑名单：明确不是产品名的关键词
const PRODUCT_BLACKLIST = [
    // 填写说明类
    '单选', '多选', '文本', '数值', '数值，无小数', '必填', '选填',
    // 准入资料类
    '提供', '可提供', '不提供', 'A类要求', 'B类要求', '状态确认',
    // 其他非产品
    '/', '—', '-', '无', 'N/A', 'n/a', '暂无', '待定',
];

// 可疑词：可能不是产品名的短语
const SUSPICIOUS_KEYWORDS = [
    '要求', '说明', '备注', '类型', '状态', '确认', '附件', '资料',
];

// 正面特征：表明是真实产品名的模式
const PRODUCT_POSITIVE_PATTERNS = [
    /[A-Z]{2,}/,           // 连续大写字母（如 ET850, DNC）
    /[A-Za-z]+\d+/,        // 字母+数字组合（如 V6E, ET50）
    /\d+kWh/i,             // 电池容量
    /\d+[mM][mM]/,         // 尺寸单位
    /栏板|厢货|客运|货运|高顶|长轴|短轴/, // 配置类型
    /宁德|比亚迪|国轩|蜂巢/,  // 电池品牌
];

export interface ProductConfidence {
    name: string;
    confidence: number;      // 0-100
    paramCount: number;
    level: 'high' | 'medium' | 'low';
    reason?: string;         // 低置信度原因
}

/**
 * 计算单个产品的置信度分数
 */
export const calculateProductConfidence = (
    productName: string,
    paramCount: number
): ProductConfidence => {
    let score = 0;
    let reason = '';
    
    const name = productName.trim();
    
    // 1. 黑名单检查 (权重 25%) - 命中则直接低分
    if (PRODUCT_BLACKLIST.some(kw => name === kw || name.toLowerCase() === kw.toLowerCase())) {
        return {
            name,
            confidence: 0,
            paramCount,
            level: 'low',
            reason: '匹配黑名单关键词'
        };
    }
    
    // 2. 参数数量评分 (权重 40%)
    // >100 参数 = 40分, >50 = 30分, >20 = 20分, <20 = 10分, <5 = 0分
    let paramScore = 0;
    if (paramCount >= 100) paramScore = 40;
    else if (paramCount >= 50) paramScore = 30;
    else if (paramCount >= 20) paramScore = 20;
    else if (paramCount >= 5) paramScore = 10;
    else {
        paramScore = 0;
        reason = `参数数量过少(${paramCount})`;
    }
    score += paramScore;
    
    // 3. 名称特征评分 (权重 35%)
    let nameScore = 0;
    
    // 3.1 正面特征匹配
    const positiveMatches = PRODUCT_POSITIVE_PATTERNS.filter(p => p.test(name));
    if (positiveMatches.length >= 2) {
        nameScore = 35;
    } else if (positiveMatches.length === 1) {
        nameScore = 25;
    } else {
        // 3.2 名称长度和内容检查
        if (name.length > 10 && /[\u4e00-\u9fa5]/.test(name) && /[A-Za-z0-9]/.test(name)) {
            // 中英文混合且较长，可能是产品名
            nameScore = 20;
        } else if (name.length <= 4 && /^[\u4e00-\u9fa5]+$/.test(name)) {
            // 纯中文短字符串，可能不是产品名
            nameScore = 5;
            if (!reason) reason = '名称过短且为纯中文';
        } else {
            nameScore = 15;
        }
    }
    
    // 3.3 可疑词扣分
    if (SUSPICIOUS_KEYWORDS.some(kw => name.includes(kw))) {
        nameScore = Math.max(0, nameScore - 10);
        if (!reason) reason = '包含可疑关键词';
    }
    
    score += nameScore;
    
    // 确定置信度等级
    let level: 'high' | 'medium' | 'low';
    if (score >= 60) {
        level = 'high';
    } else if (score >= 35) {
        level = 'medium';
    } else {
        level = 'low';
    }
    
    return {
        name,
        confidence: score,
        paramCount,
        level,
        reason: level === 'low' ? reason : undefined
    };
};

/**
 * 批量计算产品置信度并排序
 * 高置信度排前面，低置信度排后面
 */
export const calculateAllProductConfidences = (
    products: { name: string; paramCount: number }[]
): ProductConfidence[] => {
    return products
        .map(p => calculateProductConfidence(p.name, p.paramCount))
        .sort((a, b) => {
            // 先按等级排序
            const levelOrder = { high: 0, medium: 1, low: 2 };
            if (levelOrder[a.level] !== levelOrder[b.level]) {
                return levelOrder[a.level] - levelOrder[b.level];
            }
            // 同等级按置信度降序
            return b.confidence - a.confidence;
        });
};

/**
 * 过滤掉低置信度且未确认的产品
 */
export const filterConfirmedProducts = (
    products: ProductConfidence[],
    confirmedNames: string[],
    excludedNames: string[]
): ProductConfidence[] => {
    return products.filter(p => {
        // 已排除的直接过滤
        if (excludedNames.includes(p.name)) return false;
        // 已确认的保留
        if (confirmedNames.includes(p.name)) return true;
        // 高/中置信度自动保留
        return p.level !== 'low';
    });
};
