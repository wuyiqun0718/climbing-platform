import type { MyInsurance } from '@climb/api';
import { policyHistory, waiverHistory } from '@climb/core';
import type { DateKey } from '@climb/utils';
import type { MockDb } from '../db';
import type { MockContext, MockRoutes } from '../router';

/** 我的 → 保险与告知书：`GET /me/insurance`。保单怎么挂入场、告知书算不算当前版都按 @climb/core，这里只补门店名、卡名 */
export function createInsuranceRoutes(db: MockDb, h: { today: () => DateKey; requireMember: (ctx: MockContext) => string }): MockRoutes {
  const storeName = (id: string) => db.stores.find(s => s.id === id)?.name ?? '';
  return {
    'GET /me/insurance': (ctx): MyInsurance => {
      const me = h.requireMember(ctx);
      const policies = policyHistory(db.policies, db.checkIns, me).map(({ policy, checkIns }) => ({
        ...policy,
        storeName: storeName(policy.storeId),
        checkIns: checkIns.map(c => ({ id: c.id, on: c.on, storeName: storeName(c.storeId), cardName: db.cards.find(x => x.id === c.cardId)?.name ?? '', first: c.first })),
      }));
      return { policies, waiver: waiverHistory(db.waiverVersions, db.waivers, me, h.today()) };
    },
  };
}
