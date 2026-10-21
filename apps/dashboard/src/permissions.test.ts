import type { StaffRole, Store } from '@climb/api';
import { describe, expect, it } from 'vitest';
import { ACTION_ROLES, canDo, canSeeAllAuditLogs, canSeePage, PAGE_ROLES, resolveStore, storeOptions, type ActionKey, type PageKey } from './permissions';

const ROLES: StaffRole[] = ['owner', 'manager', 'desk'];
const STORES: Store[] = [
  { id: 'bingang', name: '滨港店' },
  { id: 'huiju', name: '汇聚店' },
  { id: 'huanqiu', name: '环球港店' },
];
const allStores = { storeIds: [] };
const oneStore = { storeIds: ['bingang'] };
const twoStores = { storeIds: ['bingang', 'huiju'] };

describe('页面权限', () => {
  // 整张表写出来，改权限时这里必须跟着改
  const expected: Record<PageKey, StaffRole[]> = {
    dashboard: ['owner', 'manager', 'desk'],
    finance: ['owner', 'manager'],
    members: ['owner', 'manager', 'desk'],
    courses: ['owner', 'manager', 'desk'],
    events: ['owner', 'manager', 'desk'],
    entries: ['owner', 'manager', 'desk'],
    products: ['owner', 'manager'],
    staff: ['owner'],
    settings: ['owner'],
    audit: ['owner', 'manager'],
  };

  it.each(Object.keys(PAGE_ROLES) as PageKey[])('%s', page => {
    expect(ROLES.filter(r => canSeePage(r, page))).toEqual(expected[page]);
  });

  it('前台看不到财务、卡种与价格、员工', () => {
    expect((['finance', 'products', 'staff'] as const).some(p => canSeePage('desk', p))).toBe(false);
  });

  it('每个角色都能看看板（没权限时回到这里）', () => {
    expect(ROLES.every(r => canSeePage(r, 'dashboard'))).toBe(true);
  });
});

describe('操作权限', () => {
  const expected: Record<ActionKey, StaffRole[]> = {
    'member.create': ['owner', 'manager', 'desk'],
    'order.create': ['owner', 'manager', 'desk'],
    'checkIn.create': ['owner', 'manager', 'desk'],
    'checkIn.void': ['owner', 'manager', 'desk'],
    'card.adjust': ['owner', 'manager'],
    'card.freeze': ['owner', 'manager'],
    'card.freezeOverride': ['owner', 'manager'],
    'order.refund': ['owner', 'manager'],
    'product.edit': ['owner', 'manager'],
    'product.price': ['owner', 'manager'],
    'staff.manage': ['owner'],
    'import.run': ['owner'],
    'settings.freezeRules': ['owner'],
    'data.export': ['owner', 'manager'],
    'classType.edit': ['owner', 'manager'],
    'settings.classRules': ['owner'],
    'member.fullPhone': ['owner'],
  };

  it.each(Object.keys(ACTION_ROLES) as ActionKey[])('%s', action => {
    expect(ROLES.filter(r => canDo(r, action))).toEqual(expected[action]);
  });
});

describe('操作日志', () => {
  it('老板都能看全部；别的角色能看全部门店的才能看全部', () => {
    expect(canSeeAllAuditLogs({ role: 'owner', storeIds: ['bingang'] })).toBe(true);
    expect(canSeeAllAuditLogs({ role: 'manager', storeIds: [] })).toBe(true);
    expect(canSeeAllAuditLogs({ role: 'manager', storeIds: ['bingang'] })).toBe(false);
  });
});

describe('门店切换', () => {
  it('能看全部门店的：第一项是「全部门店」', () => {
    expect(storeOptions(allStores, STORES).map(o => o.id)).toEqual([null, 'bingang', 'huiju', 'huanqiu']);
  });

  it('只管部分门店的：只有自己的店，没有「全部门店」', () => {
    expect(storeOptions(oneStore, STORES).map(o => o.id)).toEqual(['bingang']);
    expect(storeOptions(twoStores, STORES).map(o => o.id)).toEqual(['bingang', 'huiju']);
  });

  it('默认：能看全部的选全部门店，否则选自己的第一家店', () => {
    expect(resolveStore(allStores, STORES, undefined)).toBeNull();
    expect(resolveStore(twoStores, STORES, undefined)).toBe('bingang');
  });

  it('上次选的还能选就沿用', () => {
    expect(resolveStore(allStores, STORES, 'huiju')).toBe('huiju');
    expect(resolveStore(twoStores, STORES, 'huiju')).toBe('huiju');
  });

  it('选了没权限的店或全部门店：退回默认', () => {
    expect(resolveStore(oneStore, STORES, 'huiju')).toBe('bingang');
    expect(resolveStore(oneStore, STORES, null)).toBe('bingang');
    expect(resolveStore(allStores, STORES, 'closed-store')).toBeNull();
  });

  it('门店列表还没加载：按员工的门店判断，不清掉上次的选择', () => {
    expect(resolveStore(allStores, [], 'huiju')).toBe('huiju');
    expect(resolveStore(allStores, [], null)).toBeNull();
    expect(resolveStore(oneStore, [], null)).toBe('bingang');
    expect(resolveStore(twoStores, [], 'huiju')).toBe('huiju');
    expect(resolveStore(twoStores, [], 'huanqiu')).toBe('bingang');
  });
});
