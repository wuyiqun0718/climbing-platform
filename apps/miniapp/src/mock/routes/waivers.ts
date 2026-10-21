import { currentWaiver, signWaiver, type WaiverSignature } from '@climb/core';
import type { DateKey } from '@climb/utils';
import type { MockDb } from '../db';
import { MockHttpError, type MockContext, type MockRoutes } from '../router';

/** 风险告知书：`POST /waivers`。只能签当前版本、签过不重复记都按 @climb/core 的 signWaiver */
export function createWaiverRoutes(
  db: MockDb,
  h: { now: () => Date; today: () => DateKey; nextId: (prefix: string) => string; requireMember: (ctx: MockContext) => string },
): MockRoutes {
  return {
    'POST /waivers': (ctx): WaiverSignature => {
      const me = h.requireMember(ctx);
      const { waiverVersionId } = ctx.body as { waiverVersionId?: unknown };
      if (typeof waiverVersionId !== 'string' || !waiverVersionId) throw new MockHttpError(400, 'bad-request', '缺少告知书版本');
      const { signature, created } = signWaiver({
        id: h.nextId('waiver-sign'),
        memberId: me,
        waiverVersionId,
        current: currentWaiver(db.waiverVersions, h.today()),
        signatures: db.waivers,
        at: h.now().toISOString(),
      });
      if (created) db.waivers.push(signature);
      return signature;
    },
  };
}
