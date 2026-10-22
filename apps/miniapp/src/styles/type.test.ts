import { describe, expect, it } from 'vitest';
import emptySrc from '@climb/ui-mp/Empty.vue?raw';
import fieldSrc from '@climb/ui-mp/Field.vue?raw';

// 第七轮：文字和排版一致性。实际样子看 docs/ui-review/after/eval7-type
const files = import.meta.glob<string>(['../pages/**/*.vue', '../components/*.vue', '../lib/*.ts'], { query: '?raw', import: 'default', eager: true });
const all = Object.entries(files).filter(([p]) => !p.includes('.test.'));

describe('金额和日期', () => {
  it('金额都走 formatYuan，不自己拼 ¥、不用 toLocaleString（小程序安卓上不一定有千分位）', () => {
    for (const [path, src] of all) {
      expect(src, path).not.toMatch(/toLocaleString|toFixed\(2\)/);
      expect(src, path).not.toMatch(/['`]¥/);
    }
  });

  it('列表里的日期用 formatListDay，不自己拼「几月几日」', () => {
    for (const page of ['../pages/cards/detail.vue', '../pages/me/orders.vue', '../pages/me/insurance.vue', '../pages/me/calendar.vue', '../pages/share/referral.vue']) {
      expect(files[page], page).toMatch(/formatListDay\(/);
    }
    for (const [path, src] of all) expect(src, path).not.toMatch(/\}\}月\{\{|\}月\$\{/);
  });
});

describe('排版', () => {
  it('分区标题是 20px 标题字体', () => {
    for (const page of ['../pages/cards/detail.vue', '../pages/cards/index.vue', '../pages/index/index.vue', '../pages/coach/schedule.vue']) {
      expect(files[page], page).toMatch(/\.h \{ (display: block; )?font-family: var\(--font-display\); font-size: 20px;/);
    }
    expect(files['../pages/me/insurance.vue']).toMatch(/\.label \{[^}]*font-family: var\(--font-display\); font-size: 20px;/);
  });

  it('灰色多行小字行高统一 1.6', () => {
    for (const [path, src] of [...all, ['Empty.vue', emptySrc], ['Field.vue', fieldSrc]]) {
      expect(src, path).not.toMatch(/line-height: 1\.5;/);
    }
  });
});
