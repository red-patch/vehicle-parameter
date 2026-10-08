import { describe, expect, it } from 'vitest';
import { buildMigrationRecord, deriveMigrationCandidate } from '../announcementMigration';
import type { VehicleParameter } from '../../types';

const param = (name: string, value: string): VehicleParameter => ({
    id: `p-${name}`,
    group: '工信部数据',
    name,
    value,
});

describe('deriveMigrationCandidate', () => {
    it('takes announceNo from 车辆型号 and vehicleName from 产品名称', () => {
        const c = deriveMigrationCandidate(
            '大拿V1 SH5041XXYU6BEV-J51.json',
            '大拿V1 货运版',
            [param('车辆型号', 'SH5041XXYU6BEV-J51'), param('产品名称', '大拿V1'), param('批次', '第389批')],
            '2026-09-01T00:00:00Z',
        );
        expect(c.announceNo).toBe('SH5041XXYU6BEV-J51');
        expect(c.vehicleName).toBe('大拿V1');
        expect(c.batch).toBe('第389批');
        expect(c.paramCount).toBe(3);
        expect(c.baseName).toBe('大拿V1_SH5041XXYU6BEV-J51_第389批');
    });

    it('falls back to announce keys then file base name', () => {
        const c = deriveMigrationCandidate('金旅E80.json', null, [param('公告号', 'XML5048XXYEV10')], null);
        expect(c.announceNo).toBe('XML5048XXYEV10');
        expect(c.vehicleName).not.toBe('');
        expect(c.batch).toBe('');
    });

    it('falls back to file base name when params carry nothing', () => {
        const c = deriveMigrationCandidate('某车型.json', null, [], null);
        expect(c.announceNo).toBe('某车型');
    });

    it('derives vehicleName from the group key when 产品名称 is missing', () => {
        const c = deriveMigrationCandidate('远程V8E-55.23kWh DNC1.json', null, [param('公告号', 'DNC1')], null);
        expect(c.vehicleName).toBe(c.vehicleName.trim());
        expect(c.vehicleName).toContain('V8E');
    });
});

describe('buildMigrationRecord', () => {
    it('produces a params-only record with no pdf and the query source url', () => {
        const c = deriveMigrationCandidate('a.json', null, [param('公告号', 'DNC1')], '2026-09-01T00:00:00Z');
        const record = buildMigrationRecord(c, [param('公告号', 'DNC1')]);
        expect(record.version).toBe('1.0');
        expect(record.pdfFile).toBeNull();
        expect(record.parameters).toHaveLength(1);
        expect(record.importedAt).toBe('2026-09-01T00:00:00Z');
        expect(record.sourceUrl).toContain('querydata=DNC1');
    });

    it('stamps importedAt with now when the asset has no updatedAt', () => {
        const c = deriveMigrationCandidate('a.json', null, [], null);
        const record = buildMigrationRecord(c, []);
        expect(new Date(record.importedAt).getTime()).not.toBeNaN();
    });
});
