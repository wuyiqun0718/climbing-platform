import type { DateKey } from '@climb/utils';

/**
 * 入场保险（docs/mvp-plan.md 第 9 节已定：每次入场单独投保，期限卡、次卡、单次票、体验券入场都含保险）。
 * 一人一天一张保单：当天第一次入场新投一张；同一天再次入场（不管哪家店、哪种入场方式）不再投，复用当天那张。
 * 扫码入场、前台登记、mock 和后端都按这里。
 *
 * 状态：pending 投保中（刚入场，等保险公司结果）→ insured 成功 / failed 失败（失败的在原保单上重试，见任务 34，不另投）；
 * 撤销入场后标记 refund_pending 待退保 → refunded 已退保（同一天还有别的入场时改挂过去，见 voidCheckIn.ts；退保收尾见任务 33）。
 * 待退保、已退保的保单不再算当天的保单：撤销后同一天又入场，会新投一张。
 * 保费、保险公司接口还是每天交名单等馆方（第 9 节「要问馆方」14），这里不管。
 */

export type PolicyStatus = 'pending' | 'insured' | 'failed' | 'refund_pending' | 'refunded';

export const POLICY_STATUS_TEXT: Record<PolicyStatus, string> = {
  pending: '投保中',
  insured: '已投保',
  failed: '投保失败',
  refund_pending: '待退保',
  refunded: '已退保',
};

/** 保单（对应 insurance_policies 表）里判断要用的字段 */
export interface InsurancePolicy {
  id: string;
  memberId: string;
  /** 当天第一次入场的门店 */
  storeId: string;
  on: DateKey;
  /** 投这张保单的那次入场；同日再次入场复用这张，不改这里 */
  checkInId: string;
  status: PolicyStatus;
}

/** 这张保单还算不算当天的保单（待退保、已退保的不算） */
export const isPolicyInForce = (p: Pick<InsurancePolicy, 'status'>) => p.status !== 'refund_pending' && p.status !== 'refunded';

/** 这次入场要不要投保：今天已经有一张就复用（needed = false，带上那张），没有就要新投 */
export function insuranceForEntry<P extends InsurancePolicy>(
  policies: readonly P[],
  memberId: string,
  today: DateKey,
): { needed: true; policy: null } | { needed: false; policy: P } {
  const policy = policies.find(p => p.memberId === memberId && p.on === today && isPolicyInForce(p));
  return policy ? { needed: false, policy } : { needed: true, policy: null };
}

/** 新投的保单，状态是投保中 */
export function newPolicy(args: Omit<InsurancePolicy, 'status'>): InsurancePolicy {
  return { ...args, status: 'pending' };
}
