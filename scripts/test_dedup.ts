import XLSX from 'xlsx';

const workbook = XLSX.readFile('./docs/商品中心_产品中心_属性池.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

// 模拟去重逻辑
const uniqueMap = new Map<string, string>();
jsonData.forEach((row) => {
  const name = row['属性名称'] as string;
  if (name && !uniqueMap.has(name)) {
    uniqueMap.set(name, (row['是否必填'] as string) || '');
  }
});

console.log('原始数据条数:', jsonData.length);
console.log('去重后条数:', uniqueMap.size);
console.log('去除重复:', jsonData.length - uniqueMap.size, '条');

// 输出前10条去重结果
console.log('\n前10条去重结果:');
let count = 0;
for (const [name, required] of uniqueMap) {
  if (count++ >= 10) break;
  console.log(`${name} - ${required}`);
}
