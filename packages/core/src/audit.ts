/**
 * 员工操作日志（对应 audit_logs 表，docs/mvp-plan.md 第 4 节）：谁、什么时候、对什么、改前改后、原因。只追加，不能改、不能删。
 * 后台写日志的地方（mock 和后端）都用这里的动作名和 auditDiff / auditSnapshot，保证不记密码这类敏感字段。
 */

export type AuditAction =
  | 'order.create'
  | 'order.refund'
  | 'check_in.create'
  | 'check_in.void'
  | 'card.adjust'
  | 'card.freeze'
  | 'card.unfreeze'
  | 'product.create'
  | 'product.update'
  | 'staff.create'
  | 'staff.update'
  | 'staff.password_reset'
  | 'settings.freeze_rules'
  | 'data.export';

export type AuditTargetType = 'order' | 'check_in' | 'card' | 'product' | 'staff' | 'settings' | 'export';

export const AUDIT_ACTIONS = [
  'order.create',
  'order.refund',
  'check_in.create',
  'check_in.void',
  'card.adjust',
  'card.freeze',
  'card.unfreeze',
  'product.create',
  'product.update',
  'staff.create',
  'staff.update',
  'staff.password_reset',
  'settings.freeze_rules',
  'data.export',
] as const satisfies readonly AuditAction[];

export const AUDIT_ACTION_TEXT: Record<AuditAction, string> = {
  'order.create': '线下收款开卡',
  'order.refund': '退款',
  'check_in.create': '前台登记入场',
  'check_in.void': '撤销入场',
  'card.adjust': '调整次数、有效期',
  'card.freeze': '冻结',
  'card.unfreeze': '解冻',
  'product.create': '新建卡种',
  'product.update': '修改卡种',
  'staff.create': '新增员工',
  'staff.update': '修改员工',
  'staff.password_reset': '重置密码',
  'settings.freeze_rules': '改冻结规则',
  'data.export': '导出',
};

export interface AuditLogEntry {
  id: string;
  /** 操作的员工 */
  staffId: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  /** 跟哪家店有关（订单、入场的门店，卡按会员的归属门店）；卡种、员工、设置这类全馆的为 null */
  storeId: string | null;
  /** 员工填的原因、备注；没有为空字符串 */
  reason: string;
  /** 改前、改后；新建的 before 为 null，只记改了的字段，不记密码等敏感字段 */
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** ISO 8601 带时区 */
  at: string;
}

/** 不进日志的字段（任何一层出现都去掉） */
export const AUDIT_SENSITIVE_KEYS: readonly string[] = ['password', 'passwordHash', 'token', 'tokenVersion'];

const strip = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !AUDIT_SENSITIVE_KEYS.includes(k)).map(([k, x]) => [k, strip(x)]));
  return v;
};

/** 日志里存的样子：深拷贝，去掉敏感字段和值为 undefined 的字段 */
export function auditSnapshot(obj: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(strip(obj))) as Record<string, unknown>;
}

/** 改前改后只留变了的字段（按 JSON 比较，字段从无到有、从有到无都算）；没变返回 null */
export function auditDiff(before: object, after: object): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b = auditSnapshot(before);
  const a = auditSnapshot(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(k => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
  if (!keys.length) return null;
  const pick = (o: Record<string, unknown>) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));
  return { before: pick(b), after: pick(a) };
}
