import { describe, expect, it } from 'vitest';
import { DESK_MEMBER_SOURCES, MEMBER_NAME_MAX, findMemberByPhone, newMemberErrors, normalizePhone, phoneError } from './member';

describe('会员建档', () => {
  it('手机号去掉空格、横杠和 +86', () => {
    expect(normalizePhone(' 138 1234-5678 ')).toBe('13812345678');
    expect(normalizePhone('+8613812345678')).toBe('13812345678');
    expect(normalizePhone('8613812345678')).toBe('13812345678');
    expect(normalizePhone('86123')).toBe('86123');
  });

  it('手机号必须是 1 开头的 11 位', () => {
    expect(phoneError('13812345678')).toBe('');
    expect(phoneError('')).toBe('请填手机号');
    expect(phoneError('1381234567')).not.toBe('');
    expect(phoneError('23812345678')).not.toBe('');
    expect(phoneError('12812345678')).not.toBe('');
  });

  it('名字选填但有长度上限，来源只能选前台能选的', () => {
    expect(newMemberErrors({ phone: '13812345678', name: '', source: 'walkin' })).toBeNull();
    expect(newMemberErrors({ phone: '', name: '啊'.repeat(MEMBER_NAME_MAX + 1), source: 'legacy_import' })).toEqual({
      phone: '请填手机号',
      name: `名字最多 ${MEMBER_NAME_MAX} 个字`,
      source: '请选来源',
    });
    expect(DESK_MEMBER_SOURCES).not.toContain('legacy_import');
  });

  it('按规范化后的手机号判重', () => {
    const ms = [{ id: 'a', phone: '13812345678' }];
    expect(findMemberByPhone(ms, '138 1234 5678')?.id).toBe('a');
    expect(findMemberByPhone(ms, '13812345679')).toBeUndefined();
  });
});
