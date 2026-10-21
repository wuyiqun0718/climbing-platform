import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_MAX, createToaster } from './toast';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('toaster', () => {
  it('按类型到时自动消失', () => {
    const t = createToaster({ success: 1000, info: 1000, error: 3000 });
    t.success('已开卡');
    t.error('网络不通');
    vi.advanceTimersByTime(1000);
    expect(t.items.map(x => x.text)).toEqual(['网络不通']);
    vi.advanceTimersByTime(2000);
    expect(t.items).toHaveLength(0);
  });
  it('duration 为 0 不自动消失，可以手动关', () => {
    const t = createToaster({ success: 0, info: 0, error: 0 });
    const id = t.error('投保失败');
    vi.advanceTimersByTime(60_000);
    expect(t.items).toHaveLength(1);
    t.dismiss(id);
    expect(t.items).toHaveLength(0);
  });
  it('超过上限挤掉最早的', () => {
    const t = createToaster();
    for (let i = 0; i < TOAST_MAX + 2; i++) t.info(`第 ${i} 条`);
    expect(t.items).toHaveLength(TOAST_MAX);
    expect(t.items[0].text).toBe('第 2 条');
  });
  it('手动关掉后定时器不会再动别的', () => {
    const t = createToaster({ success: 1000, info: 1000, error: 1000 });
    const a = t.success('a');
    t.dismiss(a);
    t.success('b');
    vi.advanceTimersByTime(999);
    expect(t.items.map(x => x.text)).toEqual(['b']);
  });
});
