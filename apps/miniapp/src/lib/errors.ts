import { ApiError } from '@climb/api';
import type { RuleErrorCode } from '@climb/core';

/** @climb/core 的规则错误：用 Record 写全，core 加了新的错误码这里会类型报错 */
const RULE_MESSAGES: Record<RuleErrorCode, string> = {
  'card-not-usable': '这张卡现在不能用来入场',
  'card-not-shareable': '只有自己买的次卡可以分给朋友，好友送的不能再转送',
  'card-inactive': '这张卡冻结中或已经停用，现在不能用',
  'inviter-not-checked-in': '邀请你的朋友今天还没入场，等 TA 入场后体验券就能用了',
  'invalid-quantity': '至少送 1 次',
  'not-enough-remaining': '卡里剩的次数不够',
  'card-expired': '这张卡已经过期了',
  'own-share': '这是你自己发出的，发给朋友让 TA 来领',
  'already-claimed': '已经被人领走了',
  'share-expired': '这个链接已经过期了',
  'share-returned': '这个分享过期没人领，次数已经退回去了',
  'referral-not-newcomer': '老带新体验券只给第一次来的新朋友，你可以直接买票来玩',
  'referral-quota-used': '这个月的老带新名额用完了',
  'no-period-card': '有期限卡才能发老带新邀请',
  'referral-card-frozen': '期限卡冻结中，解冻后才能发老带新邀请',
  'product-off-sale': '这个已经不卖了，换一个看看',
  'order-closed': '订单超时关闭了，重新下一单吧',
  'order-not-pending': '这个订单已经付过了，刷新看看',
  'order-amount-mismatch': '支付金额不对，找前台帮你处理',
  'freeze-not-self-service': '冻结要到前台办',
  'freeze-card-not-active': '只有正在用的期限卡可以冻结',
  'freeze-days-out-of-range': '冻结天数不在允许的范围内',
  'freeze-month-quota-used': '这个月的冻结次数用完了',
  'freeze-year-quota-used': '今年的冻结次数用完了',
  'card-not-frozen': '这张卡没有冻结，刷新看看',
  'waiver-required': '先看一下风险告知书，同意后再入场',
  'waiver-outdated': '告知书刚更新了，看一下新版再同意',
  'qr-expired': '这个码过期了，扫一下平板上新的码',
  'qr-used': '这个码已经用过了，扫一下平板上新的码',
  'class-cancelled': '这节课已经取消了',
  'class-started': '这节课已经开始了',
  'class-already-booked': '这节课你已经约了',
  'class-no-card': '没有能用的团课课包，先买一个',
  'class-full': '这节课约满了',
  'class-waitlist-full': '这节课约满了，候补也排满了',
  'class-cancel-too-late': '离开课太近了，不能自己取消，找前台帮你处理',
  'booking-not-active': '这个预约已经取消或者上过课了',
  'pt-outside-hours': '这个时间不排私教',
  'pt-slot-past': '这个时段已经过了',
  'pt-slot-taken': '这个时段已经被约了，换一个',
  'pt-coach-off': '教练这个时段不接课',
  'pt-member-busy': '你这个时段已经约了别的私教',
  'pt-no-card': '没有能用的私教课包，先买一个',
  'pt-started': '这节课已经开始了',
  'pt-cancel-too-late': '离上课太近了，不能自己取消，找前台帮你处理',
  'pt-booking-not-pending': '这个预约已经处理过了，刷新看看',
};

/** 接口层的错误（后端约定的 code，mock 里也一样） */
const API_MESSAGES: Record<string, string> = {
  unauthorized: '登录过期了，重新登录一下',
  'not-found': '没找到，可能已经被删掉了',
  'card-not-found': '没找到这张卡',
  'check-in-not-found': '没找到这次入场记录',
  'invalid-qr': '这个码不是本馆的入场码',
  'share-not-found': '这个分享不存在',
  'invalid-code': '微信登录没成功，再试一次',
  'phone-required': '先验证一下手机号',
  'invalid-phone-code': '手机号没验证成功，再试一次',
  'phone-taken': '这个手机号已经绑了别的微信，找前台帮你处理',
  'wx-already-bound': '这个微信已经绑过手机号了',
  'product-not-found': '没找到这个商品，可能已经下架了',
  'order-not-found': '没找到这个订单',
  'class-not-found': '没找到这节课',
  'booking-not-found': '没找到这个预约',
  'coach-not-found': '没找到这位教练',
  'coach-not-at-store': '这位教练不在这家店上私教，换一家店看看',
};

const MESSAGES: Record<string, string> = { ...API_MESSAGES, ...RULE_MESSAGES };

/** 按 code 取中文提示（接口没报错、只是返回了原因时用，比如不能冻结的原因） */
export const codeMessage = (code: string) => MESSAGES[code] ?? '现在办不了';

export const NETWORK_ERROR = '网络不太好，稍后再试';

/** 没有对应 code 时按状态码兜底 */
function byStatus(status: number) {
  if (status === 401) return API_MESSAGES.unauthorized;
  if (status === 403) return '没有权限做这个操作';
  if (status === 404) return API_MESSAGES['not-found'];
  if (status === 429) return '操作太频繁了，歇一会儿再试';
  if (status >= 500) return '服务器出了点问题，稍后再试';
  return '没办成，稍后再试';
}

export const errorCode = (e: unknown): string | null => {
  if (!(e instanceof ApiError)) return null;
  const code = (e.data as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
};

/**
 * 把请求错误翻成给会员看的中文。
 * 顺序：已知 code 的表 → 后端带回的 message → 按状态码兜底；不是 ApiError 的当成网络问题。
 */
export function errorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return NETWORK_ERROR;
  const code = errorCode(e);
  if (code && MESSAGES[code]) return MESSAGES[code];
  const message = (e.data as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && message) return message;
  return byStatus(e.status);
}
