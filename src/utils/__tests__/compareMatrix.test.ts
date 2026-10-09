import { describe, expect, it } from 'vitest';
import { buildCompareRows } from '../compareMatrix';
import type { CompareMatrixInput } from '../compareMatrix';
import type { VehicleParameter } from '../../types';

const param = (over: Partial<VehicleParameter> & { group: string; name: string; value: string }): VehicleParameter => ({
  id: `${over.group}::${over.name}::${over.value}`,
  ...over,
});

const input = (instanceKey: string, params: VehicleParameter[]): CompareMatrixInput => ({
  instanceKey,
  params,
});

describe('buildCompareRows — 默认（不合并）', () => {
  it('按「分组::参数名」建键，跨分组同名参数各成一行', () => {
    const rows = buildCompareRows(
      [
        input('carA', [param({ group: '空气动力学', name: '迎风面积 (m²)', value: '3.33' })]),
        input('carB', [param({ group: '基础信息', name: '迎风面积 (m²)', value: '3.33' })]),
      ],
      { mergeByFieldName: false }
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.key)).toEqual([
      '空气动力学::迎风面积 (m²)',
      '基础信息::迎风面积 (m²)',
    ]);
  });

  it('跨车同分组同名参数合并为一行并给出各车值', () => {
    const rows = buildCompareRows(
      [
        input('carA', [param({ group: '尺寸', name: '车长', value: '5000' })]),
        input('carB', [param({ group: '尺寸', name: '车长', value: '5100' })]),
      ],
      { mergeByFieldName: false }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('尺寸::车长');
    expect(rows[0].carA).toBe('5000');
    expect(rows[0].carB).toBe('5100');
    expect(rows[0].hasDiff).toBe(true);
  });

  it('空值不覆盖已填值', () => {
    const rows = buildCompareRows(
      [
        input('carA', [
          param({ group: '尺寸', name: '车长', value: '5000' }),
          param({ group: '尺寸', name: '车长', value: '' }),
        ]),
      ],
      { mergeByFieldName: false }
    );

    expect(rows[0].carA).toBe('5000');
  });
});

describe('buildCompareRows — 按字段名合并', () => {
  it('同名字段跨分组合并为一行，忽略分组只按字段名配对', () => {
    const rows = buildCompareRows(
      [
        input('carA', [param({ group: '空气动力学', name: '迎风面积 (m²)', value: '3.33' })]),
        input('carB', [param({ group: '基础信息', name: '迎风面积 (m²)', value: '3.33' })]),
      ],
      { mergeByFieldName: true }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('迎风面积 (m²)');
    expect(rows[0].carA).toBe('3.33');
    expect(rows[0].carB).toBe('3.33');
    expect(rows[0].hasDiff).toBe(false);
  });

  it('合并后分组显示为「多组」，并保留具体总成清单', () => {
    const rows = buildCompareRows(
      [
        input('carA', [param({ group: '空气动力学', name: '迎风面积 (m²)', value: '3.33' })]),
        input('carB', [param({ group: '基础信息', name: '迎风面积 (m²)', value: '3.33' })]),
      ],
      { mergeByFieldName: true }
    );

    expect(rows[0].group).toBe('多组');
    expect(rows[0].groups).toEqual(['空气动力学', '基础信息']);
  });

  it('仅一个总成时分组照常显示该总成名', () => {
    const rows = buildCompareRows(
      [
        input('carA', [param({ group: '尺寸', name: '车长', value: '5000' })]),
        input('carB', [param({ group: '尺寸', name: '车长', value: '5100' })]),
      ],
      { mergeByFieldName: true }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].group).toBe('尺寸');
    expect(rows[0].hasDiff).toBe(true);
  });

  it('规则 A：某车同名跨总成且值冲突时不合并，退回分组行', () => {
    const rows = buildCompareRows(
      [
        input('carA', [
          param({ group: '红绿灯相机', name: '型号', value: 'CAM-A' }),
          param({ group: '超声波雷达', name: '型号', value: 'USS-A' }),
        ]),
        input('carB', [param({ group: '红绿灯相机', name: '型号', value: 'CAM-B' })]),
      ],
      { mergeByFieldName: true }
    );

    // 「型号」在 carA 内冲突 → 不合并，保留 分组::名 的原有行
    expect(rows.map((r) => r.key)).toEqual([
      '红绿灯相机::型号',
      '超声波雷达::型号',
    ]);
  });

  it('规则 A 只作用于冲突字段，其它可合并字段照常合并', () => {
    const rows = buildCompareRows(
      [
        input('carA', [
          param({ group: '红绿灯相机', name: '型号', value: 'CAM-A' }),
          param({ group: '超声波雷达', name: '型号', value: 'USS-A' }),
          param({ group: '基础信息', name: '车长', value: '5000' }),
        ]),
        input('carB', [
          param({ group: '红绿灯相机', name: '型号', value: 'CAM-B' }),
          param({ group: '尺寸', name: '车长', value: '5000' }),
        ]),
      ],
      { mergeByFieldName: true }
    );

    // 冲突字段「型号」仍是分组行，且从未被合并
    const typeRows = rows.filter((r) => r.name === '型号');
    expect(typeRows.map((r) => r.key)).toEqual(['红绿灯相机::型号', '超声波雷达::型号']);
    expect(typeRows.some((r) => r.group === '多组')).toBe(false);

    // 无冲突字段「车长」已合并
    const lengthRow = rows.find((r) => r.name === '车长')!;
    expect(lengthRow.group).toBe('多组');
    expect(lengthRow.hasDiff).toBe(false);
  });

  it('合并后 hasAnyValue 按合并值判定', () => {
    const rows = buildCompareRows(
      [
        input('carA', [param({ group: '空气动力学', name: '迎风面积 (m²)', value: '' })]),
        input('carB', [param({ group: '基础信息', name: '迎风面积 (m²)', value: '3.33' })]),
      ],
      { mergeByFieldName: true }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].hasAnyValue).toBe(true);
  });

  it('合并键不与「分组::名」键碰撞', () => {
    const rows = buildCompareRows(
      [
        input('carA', [
          param({ group: '空气动力学', name: '迎风面积 (m²)', value: '3.33' }),
          param({ group: '基础信息', name: '迎风面积 (m²)', value: '3.33' }),
        ]),
      ],
      { mergeByFieldName: true }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].key).not.toContain('::');
  });
});
