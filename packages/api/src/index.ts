import type { Card, CheckIn, Product, Share } from '@climb/core';
import { createHttp, type ClientOptions } from './client';

export * from './client';
export * from './admin';

/** `GET /coaches?store=`：能约私教的教练（后台教练资料，mvp/dashboard 任务 28） */
export interface Coach {
  id: string;
  name: string;
  tags: string[];
  bio: string;
  /** 在哪几家店接私教 */
  storeIds: string[];
}

/**
 * 接口定义（后端还没开始写，路径是约定稿）。
 * 新增接口时在这里加方法，两个端都能直接用上。
 */
export function createApi(opts: ClientOptions) {
  const http = createHttp(opts);
  return {
    products: {
      list: () => http<Product[]>('GET', '/products'),
    },
    coaches: {
      /** 能约私教的教练（在用的员工里有教练资料的，id 是员工 id）；store 不填为三家店都看 */
      list: (q: { store?: string } = {}) => http<Coach[]>('GET', q.store ? `/coaches?store=${encodeURIComponent(q.store)}` : '/coaches'),
    },
    me: {
      cards: () => http<Card[]>('GET', '/me/cards'),
    },
    checkIns: {
      /** 扫前台码入场：qrToken 是前台二维码里的内容 */
      create: (body: { qrToken: string; cardId: string }) => http<CheckIn>('POST', '/check-ins', body),
    },
    shares: {
      createCount: (body: { cardId: string; quantity: number }) => http<Share>('POST', '/shares/count', body),
      createReferral: () => http<Share>('POST', '/shares/referral'),
      get: (id: string) => http<Share>('GET', `/shares/${id}`),
      claim: (id: string) => http<{ share: Share; card: Card }>('POST', `/shares/${id}/claim`),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
