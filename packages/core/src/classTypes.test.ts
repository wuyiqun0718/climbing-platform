import { describe, expect, it } from 'vitest';
import type { ClassType } from './classes';
import { defaultClassRules, defineGym } from './gym';
import {
  CLASS_CAPACITY_MAX,
  applyClassTypePatch,
  buildClassType,
  classRulesErrors,
  classTypePatchErrors,
  newClassTypeErrors,
  sessionFromType,
  sortClassTypes,
} from './classTypes';
import { RuleError } from './rules';

const boulder: ClassType = { id: 't1', name: '入门抱石', minutes: 60, capacity: 12, credits: 1, coachId: 's-coach', active: true };
const ctx = { types: [boulder], coachIds: ['s-coach', 's-coach2'] };

describe('团课课程种类的校验', () => {
  it('时长、人数上限、扣次都是正整数；扣次不填为 1', () => {
    expect(newClassTypeErrors({ name: '进阶顶绳', minutes: 90, capacity: 8 }, ctx)).toBeNull();
    for (const bad of [0, -1, 1.5, '60', undefined]) {
      expect(newClassTypeErrors({ name: 'x', minutes: bad, capacity: 8 }, ctx)?.minutes).toBeTruthy();
      expect(newClassTypeErrors({ name: 'x', minutes: 60, capacity: bad }, ctx)?.capacity).toBeTruthy();
    }
    expect(newClassTypeErrors({ name: 'x', minutes: 60, capacity: CLASS_CAPACITY_MAX + 1 }, ctx)?.capacity).toBeTruthy();
    expect(newClassTypeErrors({ name: 'x', minutes: 60, capacity: 8, credits: 0 }, ctx)?.credits).toBeTruthy();
    expect(buildClassType('t2', { name: ' 进阶顶绳 ', minutes: 90, capacity: 8 })).toEqual({ id: 't2', name: '进阶顶绳', minutes: 90, capacity: 8, credits: 1, active: true });
  });

  it('课程名必填；启用的不能重名，停用的同名不算；默认教练要是在用的员工', () => {
    expect(newClassTypeErrors({ name: ' ', minutes: 60, capacity: 8 }, ctx)?.name).toBeTruthy();
    expect(newClassTypeErrors({ name: '入门抱石', minutes: 60, capacity: 8 }, ctx)?.name).toBe('已经有这个课程了');
    expect(newClassTypeErrors({ name: '入门抱石', minutes: 60, capacity: 8 }, { ...ctx, types: [{ ...boulder, active: false }] })).toBeNull();
    expect(newClassTypeErrors({ name: 'x', minutes: 60, capacity: 8, coachId: 'nobody' }, ctx)?.coachId).toBeTruthy();
  });

  it('修改只查传了的；原来的默认教练停用了，不改它照样能存；重新启用时查重名', () => {
    expect(classTypePatchErrors(boulder, { capacity: 15 }, ctx)).toBeNull();
    expect(classTypePatchErrors(boulder, { capacity: 15, coachId: 's-coach' }, { ...ctx, coachIds: [] })).toBeNull();
    expect(classTypePatchErrors(boulder, { coachId: 'nobody' }, ctx)?.coachId).toBeTruthy();
    expect(classTypePatchErrors(boulder, { minutes: 0 }, ctx)?.minutes).toBeTruthy();
    const old = { ...boulder, id: 't0', active: false };
    expect(classTypePatchErrors(old, { active: true }, { ...ctx, types: [boulder, old] })?.name).toBeTruthy();
    expect(classTypePatchErrors(old, { active: true, name: '入门抱石（旧）' }, { ...ctx, types: [boulder, old] })).toBeNull();
  });

  it('应用修改：只改能改的，coachId 传 null 去掉默认教练', () => {
    expect(applyClassTypePatch(boulder, { capacity: 15, coachId: null })).toEqual({ id: 't1', name: '入门抱石', minutes: 60, capacity: 15, credits: 1, active: true });
    expect(boulder.capacity).toBe(12);
  });
});

describe('排课', () => {
  const args = { id: 's1', storeId: 'bingang', on: '2026-10-25', startTime: '19:00' };

  it('从种类拷课名、时长、人数上限、扣次、默认教练；这节课可以另填人数和教练', () => {
    expect(sessionFromType(boulder, args)).toEqual({ ...args, classTypeId: 't1', name: '入门抱石', minutes: 60, capacity: 12, credits: 1, coachId: 's-coach', status: 'scheduled' });
    expect(sessionFromType(boulder, { ...args, capacity: 6, coachId: 's-coach2' })).toMatchObject({ capacity: 6, coachId: 's-coach2' });
  });

  it('改种类不影响已排的课', () => {
    const session = sessionFromType(boulder, args);
    applyClassTypePatch(boulder, { name: '新名字', capacity: 20, minutes: 90 });
    expect(session).toMatchObject({ name: '入门抱石', capacity: 12, minutes: 60 });
  });

  it('停用的种类不能排新课', () => {
    expect(() => sessionFromType({ ...boulder, active: false }, args)).toThrow(RuleError);
    try {
      sessionFromType({ ...boulder, active: false }, args);
    } catch (e) {
      expect((e as RuleError).code).toBe('class-type-inactive');
    }
  });

  it('列表启用的在前', () => {
    const list = sortClassTypes([{ ...boulder, id: 'a', active: false }, { ...boulder, id: 'b', name: '亲子' }]);
    expect(list.map(t => t.id)).toEqual(['b', 'a']);
  });
});

describe('团课规则（占位，岩馆可配）', () => {
  it('默认值跟小程序一致；岩馆只写一部分时其余用默认', () => {
    expect(defaultClassRules).toEqual({ cancelBeforeMinutes: 120, waitlist: true, waitlistMax: null, lateGraceMinutes: 15 });
    const gym = defineGym({ id: 'x', name: 'x', theme: {} as never, rules: { classRules: { waitlist: false } } } as never);
    expect(gym.rules.classRules).toEqual({ ...defaultClassRules, waitlist: false });
  });

  it('校验：分钟数 0 以上的整数，候补人数正整数或不限', () => {
    expect(classRulesErrors(defaultClassRules)).toBeNull();
    expect(classRulesErrors({ ...defaultClassRules, cancelBeforeMinutes: 0, lateGraceMinutes: 0, waitlistMax: 5 })).toBeNull();
    expect(classRulesErrors({ ...defaultClassRules, cancelBeforeMinutes: -1 })?.cancelBeforeMinutes).toBeTruthy();
    expect(classRulesErrors({ ...defaultClassRules, waitlistMax: 0 })?.waitlistMax).toBeTruthy();
    expect(classRulesErrors({ ...defaultClassRules, waitlist: 'yes' })?.waitlist).toBeTruthy();
    expect(classRulesErrors({ ...defaultClassRules, lateGraceMinutes: 1.5 })?.lateGraceMinutes).toBeTruthy();
  });
});
