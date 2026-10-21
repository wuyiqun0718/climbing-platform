import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, AUDIT_ACTION_TEXT, auditDiff, auditSnapshot } from './audit';

describe('操作日志', () => {
  it('快照去掉密码、token 等敏感字段（嵌套的也去），去掉 undefined', () => {
    expect(auditSnapshot({ name: '小葵', password: 'x', passwordHash: 'h', nested: { token: 't', ok: 1 }, list: [{ tokenVersion: 2, a: 1 }], gone: undefined })).toEqual({
      name: '小葵',
      nested: { ok: 1 },
      list: [{ a: 1 }],
    });
  });

  it('改前改后只留变了的字段；数组、对象按内容比；没变返回 null', () => {
    expect(auditDiff({ a: 1, b: [1, 2], c: 'x' }, { a: 2, b: [1, 2], c: 'x' })).toEqual({ before: { a: 1 }, after: { a: 2 } });
    expect(auditDiff({ s: ['bingang'] }, { s: ['bingang', 'huiju'] })).toEqual({ before: { s: ['bingang'] }, after: { s: ['bingang', 'huiju'] } });
    expect(auditDiff({ a: 1 }, { a: 1 })).toBeNull();
  });

  it('字段从无到有、从有到无也记；敏感字段变了不记', () => {
    expect(auditDiff({ status: 'normal' }, { status: 'frozen', frozenUntil: '2026-10-30' })).toEqual({ before: { status: 'normal' }, after: { status: 'frozen', frozenUntil: '2026-10-30' } });
    expect(auditDiff({ password: 'a', name: 'x' }, { password: 'b', name: 'x' })).toBeNull();
  });

  it('每个动作都有中文', () => {
    expect(AUDIT_ACTIONS.every(a => AUDIT_ACTION_TEXT[a])).toBe(true);
  });
});
