import type { InsurancePolicy } from './insurance';

/**
 * 后台入场记录上的保单（mvp/dashboard 任务 20）。从 insurance.ts 挪出来，insurance.ts 跟小程序分支保持一致。
 * 一次入场的保单：入场时投的或同日沿用的那张，记在入场记录的 policyId 上（跟小程序 insuranceHistory.ts 一样按这个挂，不按日期猜：
 * 撤销后同一天可能有退掉的和新投的两张）。撤销了的入场还指向原来那张，状态看保单（待退保，或者改挂给同一天别的入场后照常）。
 * 没有 policyId（上线前的、青橙导入的入场）或找不到的为 null。
 */
export function entryPolicy<P extends InsurancePolicy>(policies: readonly P[], entry: { policyId?: string | null }): P | null {
  return (entry.policyId && policies.find(p => p.id === entry.policyId)) || null;
}
