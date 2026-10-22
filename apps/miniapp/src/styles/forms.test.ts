import { describe, expect, it } from 'vitest';
import fieldSrc from '@climb/ui-mp/Field.vue?raw';

// 第五轮第二批：输入框统一用 @climb/ui-mp/Field.vue（44px、聚焦一圈主色、× 清空、错误写在框下面）。实际样子用 H5 截图脚本看
const files = import.meta.glob<string>(['../pages/**/*.vue', '../components/*.vue'], { query: '?raw', import: 'default', eager: true });
const fieldCss = fieldSrc.split('<style')[1] ?? '';
const line = (selector: string) => fieldCss.split('\n').find(l => l.startsWith(`${selector} {`)) ?? '';

describe('输入框', () => {
  it('页面和弹层里不直接写 input，都用 Field', () => {
    for (const [path, src] of Object.entries(files)) expect(src, path).not.toMatch(/<input[\s>]/);
    expect(files['../components/AskSheet.vue']).toMatch(/<Field /);
  });

  it('Field 跟按钮一样 44px 高，聚焦有主色外圈，× 的点击区 44×44', () => {
    expect(line('.field')).toMatch(/height: 44px/);
    expect(line('.field.on')).toMatch(/box-shadow: 0 0 0 3px var\(--brand\)/);
    expect(line('.clear')).toMatch(/width: 44px; height: 44px/);
    expect(fieldSrc).toMatch(/v-if="modelValue" class="clear"/);
  });

  it('点 × 换一个新 input（H5 改 value 有防抖，会留着旧字），刚清空时晚到的 input / blur 不认', () => {
    expect(fieldSrc).toMatch(/:key="inputKey"/);
    expect(fieldSrc).toMatch(/function clear\(\) \{[^}]*inputKey\.value\+\+/);
    expect(fieldSrc).toMatch(/const onBlur = [^\n]*if \(!late\(\)\)/);
    expect(fieldSrc).toMatch(/const onInput = [^\n]*if \(!late\(\)\)/);
  });

  it('登录手机号：数字键盘、最多 11 位，填错写在框下面不弹 toast', () => {
    const login = files['../pages/login/index.vue'];
    expect(login).toMatch(/<Field v-model="phone" type="number" :maxlength="11"[^>]*:error="phoneError"/);
    expect(login).not.toMatch(/showToast\(\{ title: '手机号/);
  });
});

describe('图标对齐', () => {
  // ‹ › × 这些字符在字体里偏下 1–2px，跟旁边的图标、文字对不齐；用图标或 CSS 画
  it('箭头和清除按钮不用字符', () => {
    for (const page of ['../pages/me/index.vue', '../pages/me/calendar.vue']) expect(files[page], page).not.toMatch(/>[‹›]</);
    expect(fieldSrc).not.toMatch(/>×</);
  });
});
