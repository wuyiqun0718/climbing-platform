import { describe, expect, it } from 'vitest';
import { REASON_MAX_LENGTH, createModalStack, errorText, initialFocusIndex, nextFocusIndex, reasonError } from './overlay';

describe('initialFocusIndex', () => {
  const x = { close: true };
  it('有 autofocus 先聚焦它', () => {
    expect(initialFocusIndex([x, { field: true }, { autofocus: true, field: true }])).toBe(2);
  });
  it('表单弹窗跳过 ×，聚焦第一个要填的', () => {
    expect(initialFocusIndex([x, {}, { field: true }, { field: true }])).toBe(2);
  });
  it('没有要填的就聚焦 ×，不聚焦普通按钮（名单的「缺席」）', () => {
    expect(initialFocusIndex([x, {}, {}])).toBe(0);
  });
  it('什么都没有返回 -1，聚焦面板', () => {
    expect(initialFocusIndex([])).toBe(-1);
    expect(initialFocusIndex([{}])).toBe(-1);
  });
});

describe('modalStack', () => {
  it('只有最上面的弹窗响应 Esc', () => {
    const s = createModalStack();
    const a = s.open();
    const b = s.open();
    expect(s.isTop(a)).toBe(false);
    expect(s.isTop(b)).toBe(true);
    s.close(b);
    expect(s.isTop(a)).toBe(true);
  });
  it('先关下面的也不乱', () => {
    const s = createModalStack();
    const a = s.open();
    const b = s.open();
    s.close(a);
    expect(s.isTop(b)).toBe(true);
    s.close(b);
    s.close(b);
    expect(s.size).toBe(0);
    expect(s.isTop(b)).toBe(false);
  });
});

describe('nextFocusIndex', () => {
  it('Tab 循环', () => {
    expect(nextFocusIndex(0, 3, false)).toBe(1);
    expect(nextFocusIndex(2, 3, false)).toBe(0);
  });
  it('Shift+Tab 反向循环', () => {
    expect(nextFocusIndex(0, 3, true)).toBe(2);
    expect(nextFocusIndex(2, 3, true)).toBe(1);
  });
  it('焦点不在弹窗里时进到第一个或最后一个', () => {
    expect(nextFocusIndex(-1, 3, false)).toBe(0);
    expect(nextFocusIndex(-1, 3, true)).toBe(2);
  });
  it('没有可聚焦元素', () => {
    expect(nextFocusIndex(-1, 0, false)).toBe(-1);
  });
});

describe('reasonError', () => {
  it('必填时空白不算填了', () => {
    expect(reasonError('', true)).toBe('请填写原因');
    expect(reasonError('   ', true)).toBe('请填写原因');
    expect(reasonError(' 会员手机没电 ', true)).toBe('');
  });
  it('不必填可以空', () => {
    expect(reasonError('', false)).toBe('');
  });
  it('超长', () => {
    expect(reasonError('字'.repeat(REASON_MAX_LENGTH + 1))).not.toBe('');
    expect(reasonError('字'.repeat(REASON_MAX_LENGTH))).toBe('');
  });
});

describe('errorText', () => {
  it('优先用后端返回的 message', () => {
    const e = Object.assign(new Error('请求失败（422）'), { data: { message: '退款金额超过可退金额' } });
    expect(errorText(e)).toBe('退款金额超过可退金额');
  });
  it('没有 data.message 用 Error.message', () => {
    expect(errorText(new Error('请求失败（500）'))).toBe('请求失败（500）');
  });
  it('兜底', () => {
    expect(errorText(null)).toBe('操作失败，请重试');
    expect(errorText({}, '保存失败')).toBe('保存失败');
  });
});
