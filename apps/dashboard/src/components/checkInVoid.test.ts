import type { VoidCheckInResult } from '@climb/api';
import { describe, expect, it } from 'vitest';
import { entryInsuranceText, voidMessage, voidResultText, voidText } from './checkInVoid';

describe('撤销入场的文字', () => {
  it('撤销标记带撤销人和原因；示例里没有撤销信息的只写已撤销', () => {
    expect(voidText({ voided: true, voidInfo: { at: '', byName: '前台小葵', reason: '扫错了卡' } })).toBe('已撤销（前台小葵：扫错了卡）');
    expect(voidText({ voided: true, voidInfo: null })).toBe('已撤销');
    expect(voidText({ voided: false, voidInfo: null })).toBe('');
  });

  it('确认说明按这次扣没扣次', () => {
    expect(voidMessage({ deducted: 1, cardId: 'c', cardName: '10 次卡' })).toContain('10 次卡会退回 1 次');
    expect(voidMessage({ deducted: 0, cardId: 'c', cardName: '月卡' })).toBe('这次没扣次，撤销不退次数。');
  });

  it('撤销结果：退次、转扣次、保单待退保都说出来', () => {
    const r = { restored: 1, card: { name: '10 次卡' }, moved: null, voucherRestored: false, insurance: { policyId: 'ip', status: 'refund_pending', checkInId: 'ci' } } as unknown as VoidCheckInResult;
    expect(voidResultText(r)).toBe('已撤销，10 次卡退回 1 次，保单待退保');
  });

  it('保险列：保单状态，没有保单记录的写没有保单', () => {
    expect(entryInsuranceText({ insurance: { policyId: 'ip', status: 'insured' } })).toBe('已投保');
    expect(entryInsuranceText({ insurance: null })).toBe('没有保单');
  });
});
