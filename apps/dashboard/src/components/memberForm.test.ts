import { ApiError } from '@climb/api';
import { describe, expect, it } from 'vitest';
import { badField, memberExists } from './memberForm';

describe('建档表单', () => {
  it('409 取出已有的会员，别的错误不算', () => {
    const data = { code: 'member-exists', message: '已经有了', memberId: 'm1', memberName: '小林' };
    expect(memberExists(new ApiError(409, data))).toEqual(data);
    expect(memberExists(new ApiError(409, { code: 'other' }))).toBeNull();
    expect(memberExists(new ApiError(400, data))).toBeNull();
    expect(memberExists(new Error('x'))).toBeNull();
  });

  it('400 取出出错的那一项', () => {
    expect(badField(new ApiError(400, { field: 'phone' }))).toBe('phone');
    expect(badField(new ApiError(400, null))).toBeNull();
    expect(badField(new ApiError(409, { field: 'phone' }))).toBeNull();
  });
});
