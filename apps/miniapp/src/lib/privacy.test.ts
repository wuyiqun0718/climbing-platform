import { describe, expect, it } from 'vitest';
import { createPrivacy } from './privacy';

function setup(saved: string | null, wxNeedsAuth: () => Promise<boolean> = async () => false) {
  let stored = saved;
  const privacy = createPrivacy({ version: 'v2', load: () => stored, save: v => (stored = v), wxNeedsAuth });
  return { privacy, stored: () => stored };
}

describe('隐私同意', () => {
  it('没同意过要弹；同意后不再弹', async () => {
    const { privacy, stored } = setup(null);
    expect(await privacy.needConsent()).toBe(true);
    privacy.agree();
    expect(stored()).toBe('v2');
    expect(await privacy.needConsent()).toBe(false);
  });

  it('指引换了版本要重新同意', async () => {
    const { privacy } = setup('v1');
    expect(await privacy.needConsent()).toBe(true);
  });

  it('本地同意过但微信那边还要同意，照样弹', async () => {
    const { privacy } = setup('v2', async () => true);
    expect(await privacy.needConsent()).toBe(true);
  });

  it('拿不到微信的状态时按本地记录', async () => {
    const { privacy } = setup('v2', () => Promise.reject(new Error('getPrivacySetting:fail')));
    expect(await privacy.needConsent()).toBe(false);
  });

  it('清掉后要重新同意', async () => {
    const { privacy } = setup('v2');
    privacy.clear();
    expect(await privacy.needConsent()).toBe(true);
  });
});
