import { describe, expect, it } from 'vitest';
import { STAFF_PASSWORD_MIN, newStaffErrors, staffChangeBlockedBy, staffPatchErrors, staffStoreIds, type StaffInput, type StaffRole } from './staff';

const ctx = { storeIds: ['bingang', 'huiju'], staff: [{ id: 's1', phone: '13800000001' }, { id: 's2', phone: '13800000002' }] };
const input = (over: Partial<StaffInput> = {}): StaffInput => ({ phone: '13900000009', name: '小新', role: 'desk', allStores: false, storeIds: ['bingang'], password: '123456', ...over });

describe('员工账号的校验', () => {
  it('全对返回 null；手机号先规整再查重，停用的也算', () => {
    expect(newStaffErrors(input(), ctx)).toBeNull();
    expect(newStaffErrors(input({ phone: '+86 138-0000-0001' }), ctx)?.phone).toBe('这个手机号已经有员工账号了');
    expect(newStaffErrors(input({ phone: '123' }), ctx)?.phone).toBeTruthy();
  });

  it('名字必填；角色只能是三种', () => {
    expect(newStaffErrors(input({ name: ' ' }), ctx)?.name).toBe('请填名字');
    expect(newStaffErrors(input({ role: 'coach' as StaffRole }), ctx)?.role).toBeTruthy();
  });

  it('门店：全部门店不看列表；否则至少一家，而且都要存在', () => {
    expect(newStaffErrors(input({ allStores: true, storeIds: [] }), ctx)).toBeNull();
    expect(newStaffErrors(input({ storeIds: [] }), ctx)?.storeIds).toBe('至少选一家店，或者选全部门店');
    expect(newStaffErrors(input({ storeIds: ['bingang', 'nope'] }), ctx)?.storeIds).toBe('有不存在的门店');
    expect(staffStoreIds(true, ['bingang'])).toEqual([]);
    expect(staffStoreIds(false, ['bingang', 'bingang', 'huiju'])).toEqual(['bingang', 'huiju']);
  });

  it('密码有长度要求', () => {
    expect(newStaffErrors(input({ password: 'x'.repeat(STAFF_PASSWORD_MIN - 1) }), ctx)?.password).toBeTruthy();
    expect(newStaffErrors(input({ password: undefined as never }), ctx)?.password).toBeTruthy();
  });

  it('修改只查传了的字段；改成自己现在的手机号不算重复', () => {
    expect(staffPatchErrors('s1', { name: '馆长' }, ctx)).toBeNull();
    expect(staffPatchErrors('s1', { phone: '13800000001' }, ctx)).toBeNull();
    expect(staffPatchErrors('s1', { phone: '13800000002' }, ctx)?.phone).toBeTruthy();
    expect(staffPatchErrors('s1', { storeIds: [] }, ctx)?.storeIds).toBeTruthy();
    expect(staffPatchErrors('s1', { allStores: true }, ctx)).toBeNull();
    expect(staffPatchErrors('s1', { active: 'no' }, ctx)?.active).toBeTruthy();
    expect(staffPatchErrors('s1', { password: '12' }, ctx)?.password).toBeTruthy();
  });
});

describe('员工账号不能做的改动', () => {
  const owner = { id: 'o1', role: 'owner' as const, active: true };
  const owner2 = { id: 'o2', role: 'owner' as const, active: true };
  const desk = { id: 'd1', role: 'desk' as const, active: true };

  it('不能停用自己、不能降级自己', () => {
    expect(staffChangeBlockedBy('o1', owner, { active: false }, [owner, owner2])).toBe('staff-self-deactivate');
    expect(staffChangeBlockedBy('o1', owner, { role: 'manager' }, [owner, owner2])).toBe('staff-self-demote');
    expect(staffChangeBlockedBy('o1', owner, { role: 'owner', active: true }, [owner])).toBeNull();
  });

  it('改完至少留一个在用的老板', () => {
    expect(staffChangeBlockedBy('o1', owner2, { active: false }, [owner, owner2])).toBeNull();
    expect(staffChangeBlockedBy('o1', owner2, { role: 'desk' }, [owner, owner2])).toBeNull();
    // 别的途径（比如后端脚本）操作时，最后一个在用的老板也不能停用、降级
    expect(staffChangeBlockedBy('sys', owner, { active: false }, [owner, { ...owner2, active: false }, desk])).toBe('staff-last-owner');
    expect(staffChangeBlockedBy('sys', owner, { role: 'manager' }, [owner, desk])).toBe('staff-last-owner');
  });

  it('停用、启用别的员工可以', () => {
    expect(staffChangeBlockedBy('o1', desk, { active: false }, [owner, desk])).toBeNull();
    expect(staffChangeBlockedBy('o1', { ...desk, active: false }, { active: true }, [owner, desk])).toBeNull();
  });
});
