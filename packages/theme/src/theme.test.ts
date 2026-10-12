import { describe, expect, it } from 'vitest';
import { defineTheme, toCssVars, toCssVarString } from './index';

describe('theme', () => {
  it('只覆盖传入的字段', () => {
    const t = defineTheme({ brand: '#86972f', radius: { sm: 8, md: 14, lg: 18 } });
    expect(t.brand).toBe('#86972f');
    expect(t.ink).toBe('#000000');
    expect(t.radius.sm).toBe(8);
  });
  it('生成 CSS 变量', () => {
    const vars = toCssVars(defineTheme({ brandSoft: '#eaeed3' }));
    expect(vars['--brand-soft']).toBe('#eaeed3');
    expect(vars['--chart-1']).toBe('#6f8424');
    expect(vars['--radius-md']).toBe('14px');
    expect(toCssVarString(defineTheme({}))).toContain('--stroke:2px');
  });
});
