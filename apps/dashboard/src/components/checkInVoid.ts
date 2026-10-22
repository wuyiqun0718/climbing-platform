import { ENTRY_METHOD_TEXT, type MemberEntryRow, type VoidCheckInResult } from '@climb/api';
import { POLICY_STATUS_TEXT } from '@climb/core';
import { formatDot } from '@climb/utils';

/**
 * 撤销入场（任务 16）在页面上的文字，会员详情「最近入场」和入场记录页共用。
 * 能不能撤、退几次、保单怎么改都由接口按 @climb/core 的 voidCheckIn.ts 判断，这里只管怎么说。
 */

/** 撤销了的入场的标记 */
export const voidText = (r: Pick<MemberEntryRow, 'voided' | 'voidInfo'>) =>
  r.voidInfo ? `已撤销（${r.voidInfo.byName}：${r.voidInfo.reason}）` : r.voided ? '已撤销' : '';

/** 撤销确认框里的说明：先说撤的是哪一次（列表里一排「撤销」，点错行要看得出来），再说退不退次数 */
export const voidMessage = (r: Pick<MemberEntryRow, 'deducted' | 'cardId' | 'cardName' | 'on' | 'method'>, who: { memberName: string; storeName: string }) =>
  `撤销${who.memberName || '会员'} ${formatDot(r.on)} 在${who.storeName}的入场（${ENTRY_METHOD_TEXT[r.method]}）。` + voidEffect(r);

const voidEffect = (r: Pick<MemberEntryRow, 'deducted' | 'cardId' | 'cardName'>) =>
  r.deducted
    ? `${r.cardName}会退回 ${r.deducted} 次；同一天还有免扣次的入场的话，扣次转到那次，不退。`
    : r.cardId
      ? '这次没扣次，撤销不退次数。'
      : '这次没用卡。';

/** 撤销成功后的提示：退几次、体验券、保险都按接口返回的说 */
export function voidResultText(r: VoidCheckInResult): string {
  const parts = ['已撤销'];
  if (r.moved) parts.push(`同一天还有一次入场，扣次转到那次${r.moved.card ? `（${r.moved.card.name}）` : ''}`);
  if (r.restored) parts.push(`${r.card?.name ?? ''}退回 ${r.restored} 次`);
  if (r.voucherRestored) parts.push('体验券恢复可用');
  if (r.insurance?.status === 'refund_pending') parts.push('保单待退保');
  return parts.join('，');
}

/** 入场的保险那一列：保单状态；没有保单记录的（上线前、导入的）写「没有保单」 */
export const entryInsuranceText = (r: Pick<MemberEntryRow, 'insurance'>) => (r.insurance ? POLICY_STATUS_TEXT[r.insurance.status] : '没有保单');
