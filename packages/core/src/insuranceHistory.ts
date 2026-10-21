import { formatDot, toDateKey, type DateKey } from '@climb/utils';
import type { InsurancePolicy } from './insurance';
import type { CheckIn } from './types';
import { currentWaiver, type WaiverSignature, type WaiverVersion } from './waiver';

/**
 * 我的 → 保险与告知书（小程序 pages/me/insurance）：历次保单和每张保单保的那几次入场、签过的告知书。
 * 一人一天一张保单（insurance.ts）：当天第一次入场投保，同日再次入场沿用；所以一张保单下面可能挂好几次入场。
 * 入场记录上存着它用的是哪张保单（policyId），按这个挂，不按日期猜（撤销入场后同一天可能有退掉的和新投的两张）。
 */

/** 入场记录里归到保单下要用的字段 */
export type PolicyCheckIn = Pick<CheckIn, 'id' | 'memberId' | 'on'> & { policyId: string };

export interface PolicyHistoryItem<P extends InsurancePolicy, C extends PolicyCheckIn> {
  policy: P;
  /** 这张保单保的入场，先入场的在前；第一条一般就是投保的那次 */
  checkIns: Array<C & { first: boolean }>;
}

/** 会员的历次保单，最近的在前；同一天有好几张（撤销后又入场）时后投的在前 */
export function policyHistory<P extends InsurancePolicy, C extends PolicyCheckIn>(
  policies: readonly P[],
  checkIns: readonly C[],
  memberId: string,
): PolicyHistoryItem<P, C>[] {
  const mine = policies.map((p, i) => ({ p, i })).filter(x => x.p.memberId === memberId);
  mine.sort((a, b) => (a.p.on === b.p.on ? b.i - a.i : a.p.on < b.p.on ? 1 : -1));
  return mine.map(({ p }) => ({
    policy: p,
    checkIns: checkIns.filter(c => c.memberId === memberId && c.policyId === p.id).map(c => ({ ...c, first: c.id === p.checkInId })),
  }));
}

/** 保单下面一次入场怎么说：投保的那次，还是同日再次入场沿用 */
export const policyCheckInText = (c: { first: boolean }) => (c.first ? '入场时投保' : '再次入场，沿用这张');

/** 签过的一版告知书 */
export interface SignedWaiver extends WaiverSignature {
  version: WaiverVersion;
  /** 是不是现在用的这一版 */
  current: boolean;
}

export interface WaiverHistory {
  /** 现在用的这一版；岩馆还没上告知书为 null */
  current: WaiverVersion | null;
  signedCurrent: boolean;
  /** 签过的，最近签的在前 */
  signed: SignedWaiver[];
}

export function waiverHistory(versions: readonly WaiverVersion[], signatures: readonly WaiverSignature[], memberId: string, today: DateKey): WaiverHistory {
  const current = currentWaiver(versions, today);
  const signed = signatures
    .filter(s => s.memberId === memberId)
    .flatMap(s => {
      const version = versions.find(v => v.id === s.waiverVersionId);
      return version ? [{ ...s, version, current: version.id === current?.id }] : [];
    })
    .sort((a, b) => (a.signedAt < b.signedAt ? 1 : a.signedAt > b.signedAt ? -1 : 0));
  return { current, signedCurrent: signed.some(s => s.current), signed };
}

/** 告知书那一行的状态（签名时间按本地日期显示） */
export function waiverStatusText(h: Pick<WaiverHistory, 'current' | 'signed'>): string {
  if (!h.current) return '馆里还没上告知书，不用签';
  const mine = h.signed.find(s => s.current);
  if (mine) return `${formatDot(toDateKey(new Date(mine.signedAt)))} 已签`;
  return h.signed.length ? '告知书更新了，下次入场时重签' : '还没签，第一次入场时签';
}
