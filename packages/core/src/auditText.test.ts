import { describe, expect, it } from 'vitest';
import { auditChangeLines, auditTargetText } from './auditText';

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

describe('操作日志的「对象」', () => {
  const row = (targetType: string, targetId: string, more: object = {}) => ({ action: 'card.adjust' as const, targetType: targetType as never, targetId, before: null, after: null, ...more });

  it('中文类型 + 会员名、卡名、课名、日期时间，教练换名字', () => {
    expect(auditTargetText(row('card', 'c-1', { target: { memberName: '张三', name: '10 次卡' } }))).toBe('卡 · 张三 · 10 次卡');
    expect(auditTargetText(row('order', 'o-1', { target: { memberName: '张三', name: '年卡' } }))).toBe('订单 · 张三 · 年卡');
    expect(auditTargetText(row('check_in', 'ci-1', { target: { memberName: '张三', on: '2026-10-03' } }))).toBe('入场 · 张三 · 10/3');
    expect(auditTargetText(row('class_session', 'cs-10', { target: { name: '抱石入门', on: '2026-10-23', startTime: '19:00', coachId: 's-2' } }), ctx)).toBe('团课 · 抱石入门 · 10/23 19:00 · 阿杰');
    expect(auditTargetText(row('class_booking', 'cb-1', { target: { memberName: '李四', name: '抱石入门', on: '2026-10-23', startTime: '19:00' } }))).toBe('团课预约 · 李四 · 抱石入门 · 10/23 19:00');
    expect(auditTargetText(row('pt_booking', 'pb-1', { target: { memberName: '李四', coachId: 's-2', on: '2026-10-24', hour: 9 } }), ctx)).toBe('私教预约 · 李四 · 阿杰 · 10/24 09:00–10:00');
    expect(auditTargetText(row('staff', 's-2', { target: { name: '阿杰' } }))).toBe('员工 · 阿杰');
  });

  it('规则、导出、复制课表按 id 写中文', () => {
    expect(auditTargetText(row('settings', 'freeze-rules'))).toBe('规则 · 冻结规则');
    expect(auditTargetText(row('export', 'check-ins'))).toBe('导出 · 入场记录');
    expect(auditTargetText({ ...row('class_session', '2026-10-19'), action: 'class.copy_week' })).toBe('团课课表 · 10/19 起那周');
  });

  it('退路：接口没带的从改前改后找，教练拿不到名字显示 id，什么都没有才显示 id', () => {
    expect(auditTargetText(row('class_session', 'cs-10', { before: { on: '2026-10-23', startTime: '19:00', coachId: 's-9' } }), ctx)).toBe('团课 · 10/23 19:00 · s-9');
    expect(auditTargetText(row('pt_slot', 'pm-1', { before: { coachId: 's-2', on: '2026-10-24', hour: 14 } }), ctx)).toBe('私教时段 · 阿杰 · 10/24 14:00–15:00');
    expect(auditTargetText(row('class_session', 'cs-10', { after: { name: '旧名' }, target: { name: '新名' } }))).toBe('团课 · 新名');
    expect(auditTargetText(row('card', 'c-9'))).toBe('卡 c-9');
  });

  it('改前改后里团课教练换名字', () => {
    expect(auditChangeLines({ action: 'class.update', before: { coachId: 's-2' }, after: { coachId: 's-9' } }, ctx)).toEqual(['教练：阿杰 → s-9']);
  });
});
