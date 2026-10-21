import { describe, expect, it } from 'vitest';
import { deskFeedChanges, firstEntryIds, mergeDeskFeed, parseFeedSince } from './deskFeed';

describe('首次入场', () => {
  it('会员第一次没撤销的入场算首次；之后的不算', () => {
    const list = [
      { id: 'a1', memberId: 'a', voided: false },
      { id: 'b1', memberId: 'b', voided: false },
      { id: 'a2', memberId: 'a', voided: false },
    ];
    expect([...firstEntryIds(list, new Set())]).toEqual(['a1', 'b1']);
  });

  it('第一次那条撤销了，下一条没撤销的才是首次', () => {
    expect([...firstEntryIds([{ id: 'a1', memberId: 'a', voided: true }, { id: 'a2', memberId: 'a', voided: false }], new Set())]).toEqual(['a2']);
  });

  it('青橙导入过历史入场的会员不算首次', () => {
    expect([...firstEntryIds([{ id: 'a1', memberId: 'a', voided: false }], new Set(['a']))]).toEqual([]);
  });
});

describe('增量拉取', () => {
  const rows = [{ id: 'x', seq: 3 }, { id: 'y', seq: 7 }, { id: 'z', seq: 5 }];
  it('只给 since 之后变的，按序号排，游标是最大的序号；没变化游标不动', () => {
    expect(deskFeedChanges(rows, 0)).toEqual({ items: [rows[0], rows[2], rows[1]], cursor: 7 });
    expect(deskFeedChanges(rows, 5)).toEqual({ items: [rows[1]], cursor: 7 });
    expect(deskFeedChanges(rows, 7)).toEqual({ items: [], cursor: 7 });
  });

  it('since 是 0 以上的整数，不带是 0', () => {
    expect([null, '', '12', '-1', '1.5', 'x'].map(parseFeedSince)).toEqual([0, 0, 12, null, null, null]);
  });

  it('合并：按 id 覆盖不重复，撤销的去掉，后入场的在前（后来改了也不挪位置），有上限', () => {
    const r = (id: string, order: number, voided = false, cardName = '') => ({ id, order, voided, cardName });
    let list = mergeDeskFeed([], [r('a', 1), r('b', 2)]);
    expect(list.map(x => x.id)).toEqual(['b', 'a']);
    list = mergeDeskFeed(list, [r('c', 3), r('a', 1, true)]);
    expect(list.map(x => x.id)).toEqual(['c', 'b']);
    list = mergeDeskFeed(list, [r('b', 2, false, '改了')]);
    expect(list.map(x => [x.id, x.cardName])).toEqual([['c', ''], ['b', '改了']]);
    expect(mergeDeskFeed([], [r('a', 1), r('b', 2), r('c', 3)], 2).map(x => x.id)).toEqual(['c', 'b']);
  });
});
