export const REQUIRED_FIELDS = new Set([
"AUX接口",
"TBox类型",
"USB接口",
"保养类型",
"补电&清洗",
"厂家约束",
"车辆配件供应商",
"车辆配件品牌",
"车辆配件生产商",
"车辆配件型号",
"车辆品牌",
"车辆启动",
"车辆外观",
"车辆型号",
"车辆用途",
"车身（货厢）侧门",
"车身颜色",
"车厢材质",
"车厢类型",
"车型族群",
"车载设备检修状态",
"出厂车身（货厢）侧门",
"出厂车身颜色",
"出厂车厢材质",
"出厂车厢类型",
"出厂货厢容积（m³）",
"出厂前装易流温度监测设备",
"出厂预装DST-t-box",
"出厂预装DST智能车机",
"出厂智驾等级",
"地补领取状态",
"登记所有权人是否归属集团",
"登记证状态",
"电芯品牌",
"调拨状态",
"动力电池",
"动力电池包厂商",
"动力电池包电量（kWh）",
"动力电池材料类型",
"额定载质量（kg）",
"额定载重(T)",
"工时定额",
"公告批次",
"公告续航里程（km）",
"国补领取状态",
"过户状态",
"合格证状态",
"货厢容积（m³）",
"基础功能",
"技改尾板使用天数",
"加热模块",
"交强险保单使用性质",
"交强险状态",
"解押约束",
"空调蒸发器数量",
"快充",
"快充接口厂家",
"冷藏车温区",
"冷藏车温区隔板",
"冷藏车温区温度范围",
"冷藏温区数",
"冷机品牌",
"冷机形式",
"冷厢地板结构类型",
"冷厢品牌",
"轮胎",
"年审状态",
"配件",
"品质分类",
"其他",
"前装易流温度监测设备",
"驱动电机额定/峰值功率（kw)",
"融资状态",
"商业险保单使用性质",
"商业险状态",
"上牌类型",
"上牌年份",
"设备型号",
"是否抵押主机厂",
"适用车型",
"提档范围",
"投保方案",
"维修方案",
"尾板电压",
"尾板额定载荷",
"尾板规格",
"尾板品牌",
"尾板型号",
"尾板质保结束日期",
"尾板质保开始日期",
"尾板状态",
"尾门开启方式",
"行车制动类型",
"行驶证状态",
"异常停放车辆",
"营运性质",
"远近光灯",
"运营补贴领取金额",
"运营权是否归属集团",
"遮阳板",
"整车公告号",
"整车质保状态",
"制动助力类型",
"智能车载终端设备",
"智能终端品牌",
"智能终端型号",
"主驾驶座安全气囊",
"资产来源",
"资产评级",
"作废-交流充电时间",
"作废直流充电时间（SOC从10%~80% 常温 h）",
]);

/**
 * Normalize logic for field comparison
 * 1. Remove all whitespace
 * 2. Convert Chinese parentheses to English parentheses
 * 3. Convert to lowercase
 */
const normalize = (str: string): string => {
    return str
        .replace(/\s+/g, '') // Remove spaces
        .replace(/（/g, '(')
        .replace(/）/g, ')')
        .toLowerCase();
};

// Create a normalized set for fast lookup
const NORMALIZED_REQUIRED_FIELDS = new Set<string>();
REQUIRED_FIELDS.forEach(field => {
    NORMALIZED_REQUIRED_FIELDS.add(normalize(field));
});

/**
 * Check if a field is required (insensitive to whitespace and parentheses style)
 */
export const isFieldRequired = (name: string | undefined | null): boolean => {
    if (!name) return false;
    return NORMALIZED_REQUIRED_FIELDS.has(normalize(name));
};
