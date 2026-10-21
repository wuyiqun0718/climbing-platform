import { weekdayOf, type DateKey } from '@climb/utils';

/** 今日入场和上周同日同一时段比：差几人次。跟原型一样用人次差，不用百分比（早上人少，百分比跳得厉害） */
export function entriesCompare(today: DateKey, now: number, lastWeek: number): { diff: number; text: string } {
  const diff = now - lastWeek;
  const when = `比上${weekdayOf(today)}同一时段`;
  if (diff === 0) return { diff, text: `跟上${weekdayOf(today)}同一时段持平` };
  return { diff, text: `${when}${diff > 0 ? '多' : '少'} ${Math.abs(diff)} 人次` };
}

/**
 * 只认最后一次请求的结果：快速切门店时，先发的请求晚回来不能盖掉后发的。
 * 被后来的请求顶掉的，结果（包括报错）一律变成 { stale: true }，调用方直接丢掉。
 */
export function createLatest() {
  let seq = 0;
  return async <T>(fn: () => Promise<T>): Promise<{ stale: true } | { stale: false; ok: true; value: T } | { stale: false; ok: false; error: unknown }> => {
    const mine = ++seq;
    try {
      const value = await fn();
      return mine === seq ? { stale: false, ok: true, value } : { stale: true };
    } catch (error) {
      return mine === seq ? { stale: false, ok: false, error } : { stale: true };
    }
  };
}
