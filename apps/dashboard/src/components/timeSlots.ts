/**
 * 「加一节课」开始时间的下拉：营业时间内每 15 分钟一档（开门那一刻起，到关门前最后一档），HH:MM。
 * 已有的课如果不在档上（以前排的、导入的，比如 19:10），把它也放进去，免得下拉显示不出现在的值。
 */
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toTime = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

export function timeSlots(open: string, close: string, current?: string, step = 15): string[] {
  const out: string[] = [];
  for (let n = toMin(open); n < toMin(close); n += step) out.push(toTime(n));
  if (current && /^\d{2}:\d{2}$/.test(current) && !out.includes(current)) out.push(current);
  return out.sort();
}
