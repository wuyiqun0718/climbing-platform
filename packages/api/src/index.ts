import type { Card, CheckIn, Product, Share } from '@climb/core';
import { createHttp, type ClientOptions } from './client';

export * from './client';

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
