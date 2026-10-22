import gym from '@gym';
import { mock } from '../../api';
import { ask, choose } from '../../lib/ask';
import { checkinUrl, fromScanCode, type ScanResult } from './scan';

type Nav = 'navigateTo' | 'redirectTo';

function go(r: ScanResult, method: Nav) {
  // 扫错码要会员看清楚再重扫，用弹层不用一闪而过的 toast（调用的页面都放了 AskSheet）
  if (!r.ok) return void ask({ title: '这不是本馆的入场码', content: '扫前台平板上显示的那个码就能入场。', showCancel: false, confirmText: '知道了' });
  const url = checkinUrl(r.qr);
  if (method === 'redirectTo') uni.redirectTo({ url });
  else uni.navigateTo({ url });
}

/** H5 没有摄像头扫码：mock 下选一家店（调用的页面要放 AskSheet），让「前台平板」现发一个码，当作扫到了；最后一项试「扫到别的码」的提示 */
function simulateScan(method: Nav) {
  if (!mock) return uni.showToast({ title: 'H5 下扫不了码，用微信打开小程序', icon: 'none' });
  const stores = mock.db.stores;
  choose('模拟扫码（H5 开发用）', [...stores.map(s => s.name), '扫到别的码']).then(i => {
    if (i < 0) return;
    const store = stores[i];
    if (!store) return go(fromScanCode(gym.entryQrLink, { result: 'https://example.com/' }), method);
    const qr = mock!.issueEntryQr(store.id);
    go({ ok: true, qr }, method);
  });
}

/**
 * 首页「扫码入场」：小程序里调起扫码，解析和微信扫一扫是同一套（scan.ts），都进签到页。
 * 调之前先确认登录了；method 用 redirectTo 时替换当前页（签到页上「重新扫」）。
 */
export function startScan(method: Nav = 'navigateTo') {
  // #ifdef H5
  return simulateScan(method);
  // #endif
  // #ifndef H5
  uni.scanCode({
    onlyFromCamera: true,
    scanType: ['qrCode', 'wxCode'],
    success: res => go(fromScanCode(gym.entryQrLink, res), method),
    fail: e => {
      // 用户点了取消不用提示
      if (!/cancel/.test(String((e as { errMsg?: string }).errMsg))) uni.showToast({ title: '没扫到，再试一次', icon: 'none' });
    },
  });
  // #endif
}
