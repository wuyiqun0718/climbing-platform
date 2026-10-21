import type { Store } from '@climb/api';
import { reactive } from 'vue';
import { api } from '../api';

const KEY = 'store:current';

/**
 * 当前门店：课表按它筛、首页「今日团课」看它。会员在课表页切换后记在本地，下次打开还是这家；
 * 没选过默认第一家店。
 */
export const storePick = reactive<{ stores: Store[]; currentId: string }>({
  stores: [],
  currentId: (() => { try { return (uni.getStorageSync(KEY) as string) || ''; } catch { return ''; } })(),
});

let pending: Promise<void> | null = null;

/** 门店列表只拉一次；记着的门店不在列表里了就退回第一家 */
export function ensureStores(): Promise<void> {
  if (storePick.stores.length) return Promise.resolve();
  pending ??= api.stores.list()
    .then(list => {
      storePick.stores = list;
      if (!list.some(s => s.id === storePick.currentId)) storePick.currentId = list[0]?.id ?? '';
    })
    .finally(() => { pending = null; });
  return pending;
}

export function pickStore(id: string) {
  storePick.currentId = id;
  try { uni.setStorageSync(KEY, id); } catch { /* 存不了下次就用默认 */ }
}

export const currentStoreName = () => storePick.stores.find(s => s.id === storePick.currentId)?.name ?? '';
