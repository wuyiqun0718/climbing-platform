import type { DateKey } from '@climb/utils';
import { RuleError } from './rules';

/**
 * 风险告知书：按版本签。会员签的是某一版，告知书出了新版（生效日到了）以后，旧的签名不再算数，要重签。
 * 小程序扫码入场前必须签过当前这一版（见 checkIn.ts 的 CHECK_IN_REQUIRES_WAIVER）；mock 和后端都按这里判断。
 */

/** 告知书的一个版本（对应 waiver_versions 表）。文本由岩馆提供，存在库里，不写在代码里 */
export interface WaiverVersion {
  id: string;
  /** 给人看的版本号，比如 2026-01 */
  version: string;
  title: string;
  /** 告知书条款，一条一段 */
  points: string[];
  /** 从这天起用这一版 */
  effectiveFrom: DateKey;
}

/** 会员签的告知书（对应 waivers 表） */
export interface WaiverSignature {
  id: string;
  memberId: string;
  waiverVersionId: string;
  /** ISO 时间 */
  signedAt: string;
}

/** 今天用的是哪一版：已经生效的里面生效日最晚的；生效日相同取列表里靠后的（后加的）。一版都没有返回 null */
export function currentWaiver<V extends WaiverVersion>(versions: readonly V[], today: DateKey): V | null {
  let current: V | null = null;
  for (const v of versions) {
    if (v.effectiveFrom <= today && (!current || v.effectiveFrom >= current.effectiveFrom)) current = v;
  }
  return current;
}

/** 会员签当前这一版的签名；没签过、或者只签过旧版返回 null */
export function signatureFor<S extends WaiverSignature>(signatures: readonly S[], memberId: string, current: Pick<WaiverVersion, 'id'>): S | null {
  return signatures.find(s => s.memberId === memberId && s.waiverVersionId === current.id) ?? null;
}

/** 会员签过当前这一版没有。岩馆还没上任何一版告知书时没东西可签，算签过 */
export function hasSignedWaiver(signatures: readonly WaiverSignature[], memberId: string, current: Pick<WaiverVersion, 'id'> | null): boolean {
  return !current || !!signatureFor(signatures, memberId, current);
}

/**
 * 会员同意某一版告知书。只能签当前这一版：页面上看的是旧版（中间换了版本）就拒绝（waiver-outdated），让会员看新版再签。
 * 已经签过这一版的不重复签，返回原来那条（created 为 false）。
 */
export function signWaiver(args: {
  id: string;
  memberId: string;
  waiverVersionId: string;
  current: Pick<WaiverVersion, 'id'> | null;
  signatures: readonly WaiverSignature[];
  at: string;
}): { signature: WaiverSignature; created: boolean } {
  const { current } = args;
  if (!current || current.id !== args.waiverVersionId) throw new RuleError('waiver-outdated', '告知书已经更新了，看一下新版再同意');
  const existing = signatureFor(args.signatures, args.memberId, current);
  if (existing) return { signature: existing, created: false };
  return { signature: { id: args.id, memberId: args.memberId, waiverVersionId: current.id, signedAt: args.at }, created: true };
}
