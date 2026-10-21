import { describe, expect, it } from 'vitest';
import { COACH_TAGS_MAX, cleanCoachProfile, coachProfileErrors, listCoaches, type CoachProfile } from './coach';

const all = ['bingang', 'huiju', 'huanqiu'];
const profile = (over: Partial<CoachProfile> = {}): CoachProfile => ({ tags: ['抱石'], bio: '前省队', avatarUrl: null, priceCents: 40_000, storeIds: ['bingang'], ...over });

describe('教练资料的校验', () => {
  it('可约门店至少一家、要存在、要在员工能操作的店里；全部门店的员工随便选', () => {
    expect(coachProfileErrors(profile(), ['bingang'], all)).toBeNull();
    expect(coachProfileErrors(profile({ storeIds: [] }), ['bingang'], all)?.storeIds).toBe('至少选一家接私教的店');
    expect(coachProfileErrors(profile({ storeIds: ['nope'] }), [], all)?.storeIds).toBe('有不存在的门店');
    expect(coachProfileErrors(profile({ storeIds: ['bingang', 'huiju'] }), ['bingang'], all)?.storeIds).toBe('接私教的店只能从这个员工能操作的店里选');
    expect(coachProfileErrors(profile({ storeIds: ['huiju', 'huanqiu'] }), [], all)).toBeNull();
  });

  it('单节价是正整数分，有上限', () => {
    for (const bad of [0, -100, 99.5, '400', undefined]) expect(coachProfileErrors({ ...profile(), priceCents: bad }, [], all)?.priceCents).toBeTruthy();
    expect(coachProfileErrors(profile({ priceCents: 1 }), [], all)).toBeNull();
    expect(coachProfileErrors(profile({ priceCents: 1_000_001 }), [], all)?.priceCents).toBeTruthy();
  });

  it('标签、简介、头像', () => {
    expect(coachProfileErrors(profile({ tags: Array(COACH_TAGS_MAX + 1).fill('a') }), [], all)?.tags).toBeTruthy();
    expect(coachProfileErrors(profile({ tags: ['一二三四五六七八九十一'] }), [], all)?.tags).toBeTruthy();
    expect(coachProfileErrors(profile({ bio: '啊'.repeat(201) }), [], all)?.bio).toBeTruthy();
    expect(coachProfileErrors(profile({ avatarUrl: 'http://x/a.png' }), [], all)?.avatarUrl).toBeTruthy();
    expect(coachProfileErrors(profile({ avatarUrl: 'https://cdn.example.com/a.png' }), [], all)).toBeNull();
  });

  it('存之前去空格、去空标签、门店去重', () => {
    expect(cleanCoachProfile(profile({ tags: [' 抱石 ', ''], bio: ' 前省队 ', avatarUrl: ' ', storeIds: ['bingang', 'bingang'] }))).toEqual(profile());
  });
});

describe('小程序教练列表', () => {
  const staff = [
    { id: 's1', name: 'Max', active: true, storeIds: ['bingang', 'huiju'], coach: profile({ storeIds: ['bingang', 'huiju'] }) },
    { id: 's2', name: '停用的', active: false, storeIds: [], coach: profile() },
    { id: 's3', name: '前台', active: true, storeIds: ['bingang'], coach: null },
    { id: 's4', name: '调了店的', active: true, storeIds: ['huiju'], coach: profile({ storeIds: ['bingang', 'huiju'] }) },
    { id: 's5', name: '全调走了', active: true, storeIds: ['huanqiu'], coach: profile({ storeIds: ['bingang'] }) },
  ];

  it('只有在用、有教练资料的员工；id 就是员工 id；字段同小程序的 Coach', () => {
    expect(listCoaches(staff)).toEqual([
      { id: 's1', name: 'Max', tags: ['抱石'], bio: '前省队', storeIds: ['bingang', 'huiju'] },
      { id: 's4', name: '调了店的', tags: ['抱石'], bio: '前省队', storeIds: ['huiju'] },
    ]);
  });

  it('按门店筛；员工不能操作的店不露出来', () => {
    expect(listCoaches(staff, 'bingang').map(c => c.id)).toEqual(['s1']);
    expect(listCoaches(staff, 'huiju').map(c => c.id)).toEqual(['s1', 's4']);
    expect(listCoaches(staff, 'huanqiu')).toEqual([]);
  });
});
