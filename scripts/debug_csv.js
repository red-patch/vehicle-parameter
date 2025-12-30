
const matchResults = [
    {
        id: '1',
        requirementName: 'Test "Name"',
        matchedParam: { id: 'p1', group: 'g1', name: 'Param 1', value: 123 },
        confidence: 0.9,
        isManual: false
    },
    {
        id: '2',
        requirementName: 'Empty Value',
        matchedParam: { id: 'p2', group: 'g1', name: 'Param 2', value: '' },
        confidence: 0.5,
        isManual: true
    }
];

const headers = ['需求参数名', '匹配库参数名', '填报值', '置信度', '状态'];
const rows = matchResults.map(m => [
    `"${m.requirementName.replace(/"/g, '""')}"`,
    `"${(m.matchedParam?.name || '(未匹配)').replace(/"/g, '""')}"`,
    `"${String(m.matchedParam?.value || '').replace(/"/g, '""')}"`,
    `"${(m.confidence * 100).toFixed(0)}%"`,
    `"${m.matchedParam ? '已匹配' : '未匹配'}"`
]);

const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
].join('\n');

console.log('--- CSV CONTENT START ---');
console.log(csvContent);
console.log('--- CSV CONTENT END ---');
