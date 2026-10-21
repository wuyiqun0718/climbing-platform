import { describe, expect, it } from 'vitest';
import { CSV_BOM, csvCell, toCsv } from './csv';
import { centsToYuanText } from './money';

describe('导出 CSV', () => {
  it('带 BOM，CRLF 换行，表头在第一行', () => {
    expect(toCsv(['名字', '金额'], [['小葵', '599.00']])).toBe(`${CSV_BOM}名字,金额\r\n小葵,599.00\r\n`);
  });

  it('逗号、双引号、换行整格包起来，双引号写两遍', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('他说"好"')).toBe('"他说""好"""');
    expect(csvCell('第一行\n第二行')).toBe('"第一行\n第二行"');
    expect(csvCell('x\r\ny')).toBe('"x\r\ny"');
  });

  it("防公式注入：= + - @ 制表符开头的文字前加 '；纯数字不加", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell('+86')).toBe('+86');
    expect(csvCell('a=b')).toBe('a=b');
  });

  it('数字原样，null、undefined、NaN 是空格子', () => {
    expect(toCsv(['a', 'b', 'c', 'd'], [[3, null, undefined, NaN]])).toBe(`${CSV_BOM}a,b,c,d\r\n3,,,\r\n`);
  });

  it('金额按元两位小数', () => {
    expect([59_900, 59_950, 5, 0, -1_250, 123_456_789].map(centsToYuanText)).toEqual(['599.00', '599.50', '0.05', '0.00', '-12.50', '1234567.89']);
  });
});
