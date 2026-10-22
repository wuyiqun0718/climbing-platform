import { describe, expect, it } from 'vitest';
import { auditChangeLines } from './auditText';

const ctx = { storeName: (id: string) => ({ bingang: '滨港店', huiju: '汇聚店' })[id] ?? id, staffName: (id: string) => (id === 's-2' ? '阿杰' : id) };

describe('操作日志的改前改后文字', () => {
  it('收款开卡：金额按元带千分位，收款方式中文，会员、卡、卡种 id 不列', () => {
    expect(
      auditChangeLines({
        action: 'order.create',
        before: null,
        after: { memberId: 'm-1', productId: 'p-1', productName: '年卡', listPriceCents: 10_000_000, amountCents: 9_999_999, channel: 'desk_pos', cardId: 'c-1' },
      }),
    ).toEqual(['卡种：年卡', '标价：¥100,000', '实收：¥99,999.99', '收款方式：前台刷卡']);
  });

  it('调整卡：次数带单位，日期 2026.10.12，从无到有的字段改前是 —', () => {
    expect(auditChangeLines({ action: 'card.adjust', before: { remaining: 10, expiresOn: '2026-12-31' }, after: { remaining: 99, expiresOn: '2027-01-31' } })).toEqual([
      '剩余次数：10 次 → 99 次',
      '到期日：2026.12.31 → 2027.01.31',
    ]);
    expect(auditChangeLines({ action: 'card.freeze', before: { status: 'normal' }, after: { status: 'frozen', frozenFrom: '2026-10-23', frozenUntil: '2026-11-05', followers: [{}, {}] } })).toEqual([
      '状态：正常 → 冻结中',
      '冻结开始：— → 2026.10.23',
      '冻结到：— → 2026.11.05',
      '后面的期限卡跟着顺延：— → 2 张',
    ]);
  });

  it('退款：嵌套的退款单、卡列成「退款·金额」「卡·状态」，订单状态中文', () => {
    expect(
      auditChangeLines({
        action: 'order.refund',
        before: { refundedCents: 0, status: 'paid', card: { status: 'normal', expiresOn: '2026-12-31' } },
        after: { refundedCents: 50_000, status: 'partially_refunded', refund: { id: 'rf-1', amountCents: 50_000, method: 'offline', status: 'succeeded' }, card: { status: 'refunded', expiresOn: '2026-12-31' } },
      }),
    ).toEqual(['已退：¥0 → ¥500', '订单状态：已支付 → 部分退款', '卡·状态：正常 → 已退款', '卡·到期日：2026.12.31 → 2026.12.31', '退款·金额：— → ¥500', '退款·怎么退：— → 线下退', '退款·状态：— → 已退']);
  });

  it('员工：角色、门店换名字，门店空是全部门店，教练资料嵌套', () => {
    expect(auditChangeLines({ action: 'staff.update', before: { role: 'desk', storeIds: ['bingang'] }, after: { role: 'manager', storeIds: [] } }, ctx)).toEqual(['角色：前台 → 店长', '门店：滨港店 → 全部门店']);
    expect(auditChangeLines({ action: 'staff.create', before: null, after: { name: '阿杰', coach: { priceCents: 40_000, storeIds: ['huiju'] } } }, ctx)).toEqual(['姓名：阿杰', '教练资料·私教单价：¥400', '教练资料·接课门店：汇聚店']);
  });

  it('同名字段按动作区分：status、kind', () => {
    expect(auditChangeLines({ action: 'class_booking.attend', before: { status: 'booked' }, after: { status: 'absent', sessionId: 'cs-1', memberId: 'm-1' } })).toEqual(['预约：已约 → 缺席']);
    expect(auditChangeLines({ action: 'pt_booking.cancel', before: { status: 'booked' }, after: { status: 'voided', kind: 'coach', refunded: 1 } })).toEqual([
      '预约：已约 → 教练取消了',
      '谁取消：— → 教练取消 / 拒绝',
      '退回课时：— → 1 节',
    ]);
    expect(auditChangeLines({ action: 'data.export', before: null, after: { kind: 'orders', filters: { from: '2026-10-01', to: '2026-10-23', store: 'bingang' }, rows: 12, fullPhone: false } }, ctx)).toEqual([
      '导出：订单',
      '条件·从：2026.10.01',
      '条件·到：2026.10.23',
      '条件·门店：滨港店',
      '行数：12 行',
      '手机号：打码',
    ]);
  });

  it('规则：null 是不限，开关是中文；私教时段按小时段；教练换名字', () => {
    expect(auditChangeLines({ action: 'settings.freeze_rules', before: { perMonth: 1, memberSelfService: true }, after: { perMonth: null, memberSelfService: false } })).toEqual([
      '每月最多冻结：1 次 → 不限',
      '会员自己在小程序冻结：可以 → 不行，只能前台办',
    ]);
    expect(auditChangeLines({ action: 'pt_slot.unmark', before: { id: 'pm-1', coachId: 's-2', on: '2026-10-24', hour: 9, kind: 'off' }, after: null }, ctx)).toEqual([
      '教练：阿杰',
      '日期：2026.10.24',
      '时段：09:00–10:00',
      '标成：不接课',
    ]);
  });

  it('没收录的字段原样列字段名；没有可列的返回空', () => {
    expect(auditChangeLines({ action: 'card.adjust', before: { foo: 1 }, after: { foo: { a: 1 } } })).toEqual(['foo：1 → {"a":1}']);
    expect(auditChangeLines({ action: 'staff.password_reset', before: null, after: null })).toEqual([]);
  });
});
