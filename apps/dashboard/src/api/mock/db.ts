import type { Staff, Store } from '@climb/api';
import type { DateKey } from '@climb/utils';

/** mock 后端的内存数据。每次 createMockDb() 都是一份新的，测试之间互不影响。 */
export interface MockDb {
  stores: Store[];
  staff: (Staff & { password: string; active: boolean })[];
  /** 每家店的看板数字（示例），全部门店 = 各店相加 */
  storeStats: Record<string, { monthRevenueCents: number; todayEntries: number; lastWeekSameTimeEntries: number; todayBookings: number; activeMembers: number }>;
  today: DateKey;
}

export function createMockDb(today: DateKey): MockDb {
  return {
    today,
    stores: [
      { id: 'bingang', name: '滨港店' },
      { id: 'huiju', name: '汇聚店' },
      { id: 'huanqiu', name: '环球港店' },
    ],
    // 示例账号，密码都是 123456
    staff: [
      { id: 's-owner', name: '馆长', phone: '13800000001', role: 'owner', storeIds: [], password: '123456', active: true },
      { id: 's-manager', name: '店长阿凯', phone: '13800000002', role: 'manager', storeIds: ['bingang'], password: '123456', active: true },
      { id: 's-desk', name: '前台小葵', phone: '13800000003', role: 'desk', storeIds: ['bingang'], password: '123456', active: true },
    ],
    storeStats: {
      bingang: { monthRevenueCents: 6_194_200, todayEntries: 45, lastWeekSameTimeEntries: 41, todayBookings: 9, activeMembers: 138 },
      huiju: { monthRevenueCents: 4_504_900, todayEntries: 33, lastWeekSameTimeEntries: 35, todayBookings: 7, activeMembers: 101 },
      huanqiu: { monthRevenueCents: 3_378_700, todayEntries: 25, lastWeekSameTimeEntries: 22, todayBookings: 5, activeMembers: 73 },
    },
  };
}
