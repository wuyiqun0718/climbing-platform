/**
 * 前台平板的实时入场列表（任务 38）：只看这台平板绑定的门店、今天的入场。规则：
 * - 「首次」：这个会员在系统里第一次没撤销的入场（firstEntryIds）。第一次那条撤销了，下一条没撤销的才算首次；
 *   青橙导入过历史入场的会员（legacyMembers）一条都不算首次。前台看到首次的要讲安全须知。
 * - 增量：每条入场有一个变更序号 seq（新建、撤销、扣次改了都会换成更大的新序号，全馆递增），平板带上次拿到的最大序号 since 来拉，
 *   只拿 seq > since 的（deskFeedChanges），按 seq 排；同一条入场后来又变了会再出现一次，平板按 id 覆盖（mergeDeskFeed），所以不重不漏。
 * - 撤销的入场照样发给平板（voided = true，语义同 checkIn.ts），平板从列表里去掉。
 */

/** 判定首次要的字段：checkIns 要按入场先后排（同一天按登记先后） */
export function firstEntryIds(checkIns: readonly { id: string; memberId: string; voided: boolean }[], legacyMembers: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>();
  const first = new Set<string>();
  for (const c of checkIns) {
    if (c.voided || seen.has(c.memberId)) continue;
    seen.add(c.memberId);
    if (!legacyMembers.has(c.memberId)) first.add(c.id);
  }
  return first;
}

/** since 之后变了的（seq > since），按 seq 排；cursor 是下次带的 since（没有变化就原样返回） */
export function deskFeedChanges<T extends { seq: number }>(rows: readonly T[], since: number): { items: T[]; cursor: number } {
  const items = rows.filter(r => r.seq > since).sort((a, b) => a.seq - b.seq);
  return { items, cursor: items.length ? items[items.length - 1]!.seq : since };
}

/** since 参数：0 以上的整数；不带是 0（第一次拉今天的全部） */
export function parseFeedSince(v: string | null): number | null {
  if (v === null || v === '') return 0;
  return /^\d+$/.test(v) ? Number(v) : null;
}

/**
 * 平板把拉到的变化合进列表：按 id 覆盖，撤销的去掉，后入场的在前（按 order，入场登记的先后，后来改动不影响位置）；最多留 limit 条。
 * 换了一天（today 变了）调用方先清空。
 */
export function mergeDeskFeed<T extends { id: string; order: number; voided: boolean }>(current: readonly T[], changes: readonly T[], limit = 50): T[] {
  const byId = new Map(current.map(r => [r.id, r]));
  for (const c of changes) {
    if (c.voided) byId.delete(c.id);
    else byId.set(c.id, c);
  }
  return [...byId.values()].sort((a, b) => b.order - a.order).slice(0, limit);
}
