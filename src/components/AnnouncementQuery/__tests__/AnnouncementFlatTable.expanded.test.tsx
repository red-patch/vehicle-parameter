import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnnouncementFlatTable from '../AnnouncementFlatTable';
import type { AnnouncementInfo } from '../../../utils/announcementRecord';
import type { JoinedAsset } from '../../../utils/announcementGrouping';

/**
 * 治用户反馈「显示 json 文件的意义是什么」：展开行不得泄露内部文件名。
 * 用模块级共享 fixture（不在渲染里新建对象，避免拖垮 jsdom）。
 */
const INFOS: AnnouncementInfo[] = [
    {
        jsonFile: 'V6E_DNC5037XXYBEVP1_398.json',
        announceNo: 'DNC5037XXYBEVP1',
        batch: '398',
        vehicleName: 'V6E',
        importedAt: '2026-10-02T05:25:00.000Z',
        sourceUrl: null,
        hasPdf: true,
        pdfFile: 'V6E_DNC5037XXYBEVP1_398.pdf',
        paramCount: 62,
        orphan: false,
    },
];

const LINKED = new Map<string, JoinedAsset[]>([
    [
        'DNC5037XXYBEVP1',
        [
            {
                fileName: 'V6E 宁德时代新能源科技股份有限公司 41.86 DNC5037XXYBEVP1 Ⅲ2.json',
                productName: 'V6E 宁德时代新能源科技股份有限公司 41.86 DNC5037XXYBEVP1 Ⅲ2',
                totalParams: 62,
                filledParams: 62,
            },
        ],
    ],
]);

const noop = vi.fn();

const renderTable = () =>
    render(
        <AnnouncementFlatTable
            infos={INFOS}
            linkedAssets={LINKED}
            loading={false}
            onViewLinked={noop}
            onOpenPdf={noop}
            onCopyPdf={noop}
            onViewParams={noop}
            onReveal={noop}
            onDelete={noop}
            onClaimOrphan={noop}
        />,
    );

describe('AnnouncementFlatTable 关联资产展开行', () => {
    afterEach(() => {
        cleanup();
        noop.mockClear();
    });

    it('默认不展开，展开后不出现 .json 字样', async () => {
        const { container } = renderTable();
        // 默认折叠：关联资产明细未渲染
        expect(screen.queryByText(/宁德时代新能源科技股份有限公司 41\.86/)).toBeNull();

        const expandIcon = container.querySelector('.ant-table-row-expand-icon') as HTMLElement;
        expect(expandIcon).not.toBeNull();
        fireEvent.click(expandIcon);

        // 展开后展示可读信息，且绝不含内部文件名
        await waitFor(() => {
            const text = document.body.textContent ?? '';
            expect(text).toContain('V6E 宁德时代新能源科技股份有限公司 41.86 DNC5037XXYBEVP1 Ⅲ2');
            expect(text).toContain('62 参数');
            expect(text).not.toContain('.json');
        });
    });
});
