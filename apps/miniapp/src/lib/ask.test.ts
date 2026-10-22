import { describe, expect, it } from 'vitest';
import { answer, ask, askState, choose, prompt } from './ask';

describe('ask 弹层', () => {
  it('确认得 true，取消得 false', async () => {
    const p = ask({ title: '冻结？' });
    expect(askState.open).toBe(true);
    answer(true);
    expect(await p).toBe(true);
    const q = ask({ title: '冻结？' });
    answer(false);
    expect(await q).toBe(false);
    expect(askState.open).toBe(false);
  });

  it('选项得到序号，取消得 -1', async () => {
    const p = choose('占上', ['线下约的学员', '有事不接课']);
    expect(askState.opts.options).toEqual(['线下约的学员', '有事不接课']);
    answer(true, 1);
    expect(await p).toBe(1);
    const q = choose('占上', ['a']);
    answer(false);
    expect(await q).toBe(-1);
  });

  it('输入框确认得到内容（可以是空串），取消得 null', async () => {
    const p = prompt('学员名字', '比如：小王');
    askState.value = '小王';
    answer(true);
    expect(await p).toBe('小王');
    const q = prompt('学员名字', '');
    answer(true);
    expect(await q).toBe('');
    const r = prompt('学员名字', '');
    askState.value = '写了一半';
    answer(false);
    expect(await r).toBeNull();
  });

  it('新弹层顶掉旧的，旧的按取消算', async () => {
    const p = choose('占上', ['a']);
    const q = ask({ title: '另一个' });
    expect(await p).toBe(-1);
    answer(true);
    expect(await q).toBe(true);
  });
});
