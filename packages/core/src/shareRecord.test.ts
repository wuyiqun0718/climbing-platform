import { describe, expect, it } from 'vitest';
import { SHARE_RECORD_STATE_TEXT, shareRecordState } from './shareRecord';

const today = '2026-10-21';

describe('分享记录的状态', () => {
  it('没人领：到期日当天还是等朋友领取，过了才算过期', () => {
    expect(shareRecordState({ status: 'pending', expiresOn: today }, null, today)).toBe('pending');
    expect(shareRecordState({ status: 'pending', expiresOn: '2026-10-20' }, null, today)).toBe('expired');
  });

  it('老带新：领了没用是 claimed，体验券用过是 used；领了以后过期不影响', () => {
    const share = { status: 'claimed' as const, expiresOn: '2026-09-30' };
    expect(shareRecordState(share, { kind: 'referral' }, today)).toBe('claimed');
    expect(shareRecordState(share, { kind: 'referral', usedOn: '2026-09-12' }, today)).toBe('used');
  });

  it('次卡转赠：好友送的次卡用掉过才算 used；撤销入场退回后变回 claimed', () => {
    const share = { status: 'claimed' as const, expiresOn: '2027-01-01' };
    expect(shareRecordState(share, { kind: 'gift', total: 2, remaining: 2 }, today)).toBe('claimed');
    expect(shareRecordState(share, { kind: 'gift', total: 2, remaining: 1 }, today)).toBe('used');
    expect(shareRecordState(share, { kind: 'gift', total: 2, remaining: 0 }, today)).toBe('used');
  });

  it('share.status 是 used 的直接算 used；领了但卡找不到算 claimed', () => {
    expect(shareRecordState({ status: 'used', expiresOn: today }, null, today)).toBe('used');
    expect(shareRecordState({ status: 'claimed', expiresOn: today }, null, today)).toBe('claimed');
  });

  it('文字跟小程序一致', () => {
    expect(SHARE_RECORD_STATE_TEXT).toEqual({ pending: '等朋友领取', expired: '过期了，没人领', claimed: '朋友领了，还没来', used: '朋友来过了' });
  });
});
