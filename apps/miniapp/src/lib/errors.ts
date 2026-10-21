import { ApiError } from '@climb/api';
import type { RuleErrorCode } from '@climb/core';

/** @climb/core 的规则错误：用 Record 写全，core 加了新的错误码这里会类型报错 */
const RULE_MESSAGES: Record<RuleErrorCode, string> = {
  'card-not-usable': '这张卡现在不能用来入场',
  'inviter-not-checked-in': '邀请你的朋友今天还没入场，等 TA 入场后体验券就能用了',
  'invalid-quantity': '至少送 1 次',
  'not-enough-remaining': '卡里剩的次数不够',
  'card-expired': '这张卡已经过期了',
  'own-share': '这是你自己发出的，发给朋友让 TA 来领',
  'already-claimed': '已经被人领走了',
  'share-expired': '这个链接已经过期了',
  'referral-quota-used': '这个月的老带新名额用完了',
  'no-period-card': '有期限卡才能发老带新邀请',
};

/** 接口层的错误（后端约定的 code，mock 里也一样） */
const API_MESSAGES: Record<string, string> = {
  unauthorized: '登录过期了，重新登录一下',
  'not-found': '没找到，可能已经被删掉了',
  'card-not-found': '没找到这张卡',
  'card-not-shareable': '只有自己买的次卡可以分给朋友',
  'invalid-qr': '这个码不是本馆的入场码',
  'share-not-found': '这个分享不存在',
};

const MESSAGES: Record<string, string> = { ...API_MESSAGES, ...RULE_MESSAGES };

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
