import { useMemo } from 'react';
import { Button, Input, Tag } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';

interface ImportTextProps {
  importText: string;
  onImportTextChange: (v: string) => void;
  onParseImport: () => void;
  parseErrors?: Set<number>;
}

const EMPTY_PARSE_ERRORS = new Set<number>();

const ImportText = ({
  importText,
  onImportTextChange,
  onParseImport,
  parseErrors = EMPTY_PARSE_ERRORS,
}: ImportTextProps) => {
  const sortedErrors = useMemo(
    () => Array.from(parseErrors).sort((a, b) => a - b),
    [parseErrors],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Input.TextArea
        rows={5}
        value={importText}
        onChange={(e) => onImportTextChange(e.target.value)}
        onPressEnter={(e) => {
          if (!e.shiftKey) onParseImport();
        }}
        placeholder={'整车=4600*1500*2200\n轴距:2200\n接近角:28'}
        spellCheck={false}
        style={{ fontFamily: 'monospace', fontSize: 11 }}
      />

      {sortedErrors.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {sortedErrors.map((lineIdx) => (
            <Tag key={lineIdx} color="error">
              第 {lineIdx + 1} 行格式错误
            </Tag>
          ))}
        </div>
      )}

      <Button
        type="primary"
        block
        icon={<PlayCircleOutlined />}
        onClick={onParseImport}
        title="解析并更新参数 (Enter)"
      >
        解析并应用
      </Button>
    </div>
  );
};

export default ImportText;