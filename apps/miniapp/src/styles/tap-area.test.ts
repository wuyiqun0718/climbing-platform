import { describe, expect, it } from 'vitest';
import buttonSrc from '@climb/ui-mp/Button.vue?raw';

// 第五轮自评估：可点的东西点击区至少 44px。这里只守住几处容易被改回去的样式，实际尺寸用 H5 截图脚本量
const pages = import.meta.glob<string>('../pages/**/*.vue', { query: '?raw', import: 'default', eager: true });
const src = (path: string) => (path.endsWith('Button.vue') ? buttonSrc : pages[path]) ?? '';
const style = (path: string) => src(path).split('<style')[1] ?? '';
const px = (css: string, selector: string, prop: string) => {
  const block = css.split('\n').find(l => l.startsWith(`${selector} {`)) ?? '';
  const m = block.match(new RegExp(`(?:^|[ {;])${prop}: (-?\\d+)px`));
  return m ? Number(m[1]) : NaN;
};

describe('点击区', () => {
  it('普通按钮 44px 高；mini 按钮看起来 34px，伪元素上下各补 5px', () => {
    const css = style('Button.vue');
    expect(px(css, '.btn:not(.mini)', 'height')).toBe(44);
    expect(css).toMatch(/\.btn\.mini \{[^}]*overflow: visible/);
    expect(34 - 2 * px(css, '.btn.mini::before', 'top')).toBeGreaterThanOrEqual(44);
  });

  it('购卡、团课的分段和门店 chip 是 view（text 上的伪元素小程序里不一定生效），伪元素补够 44px', () => {
    for (const page of ['../pages/shop/index.vue', '../pages/classes/index.vue']) {
      expect(src(page)).not.toMatch(/<text[^>]*class="seg"/);
      const css = style(page);
      expect(32 - px(css, '.seg::before', 'top') - px(css, '.seg::before', 'bottom')).toBeGreaterThanOrEqual(44);
    }
    const classes = src('../pages/classes/index.vue');
    expect(classes).not.toMatch(/<text[^>]*class="chip"/);
    const css = style('../pages/classes/index.vue');
    // chip 30px 高，下面补的部分要在 scroll-view 的下留白里，不然会被裁掉
    expect(30 - px(css, '.chip::before', 'top') - px(css, '.chip::before', 'bottom')).toBeGreaterThanOrEqual(44);
    expect(css).toMatch(/\.stores \{[^}]*padding: 10px 16px 4px/);
  });

  it('小字链接上下补 padding、负 margin 抵掉，不改位置', () => {
    const cases: [string, string, number][] = [
      ['../pages/index/index.vue', '.link', 18],
      ['../pages/me/insurance.vue', '.toggle', 17],
      ['../pages/cards/detail.vue', '.link', 18],
    ];
    for (const [page, sel, h] of cases) {
      const css = style(page);
      const pad = px(css, sel, 'padding');
      expect(h + 2 * pad).toBeGreaterThanOrEqual(44);
      expect(px(css, sel, 'margin')).toBe(-pad);
    }
  });
});

describe('长内容', () => {
  it('保单里卡名很长时，右边「入场时投保」不折行', () => {
    const css = style('../pages/me/insurance.vue');
    expect(css).toMatch(/\.e-text \{ flex: 1; min-width: 0; \}/);
    expect(css).toMatch(/\.e-how \{ flex: none; \}/);
  });
});
