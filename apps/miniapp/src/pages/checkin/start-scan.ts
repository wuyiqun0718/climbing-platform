import gym from '@gym';
import { mock } from '../../api';
import { checkinUrl, fromScanCode, NOT_OURS_MESSAGE, type ScanResult } from './scan';

type Nav = 'navigateTo' | 'redirectTo';

function go(r: ScanResult, method: Nav) {
  if (!r.ok) return uni.showToast({ title: NOT_OURS_MESSAGE, icon: 'none', duration: 2500 });
  const url = checkinUrl(r.qr);
  if (method === 'redirectTo') uni.redirectTo({ url });
  else uni.navigateTo({ url });
}

/** H5 没有摄像头扫码：mock 下选一家店，让「前台平板」现发一个码，当作扫到了；最后一项试「扫到别的码」的提示 */
function simulateScan(method: Nav) {
  if (!mock) return uni.showToast({ title: 'H5 下扫不了码，用微信打开小程序', icon: 'none' });
  const stores = mock.db.stores;
  uni.showActionSheet({
    itemList: [...stores.map(s => `模拟扫码：${s.name}`), '模拟扫到别的码'],
    success: ({ tapIndex }) => {
      const store = stores[tapIndex];
      if (!store) return go(fromScanCode(gym.entryQrLink, { result: 'https://example.com/' }), method);
      const qr = mock!.issueEntryQr(store.id);
      go({ ok: true, qr }, method);
    },
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
