import { describe, expect, it } from 'vitest';
import { ApiError, createApi, type ApiRequest } from './index';

describe('api client', () => {
  it('带上岩馆 ID 和 token', async () => {
    const seen: ApiRequest[] = [];
    const api = createApi({
      baseURL: 'https://api.example.com/',
      gymId: 'benchmark',
      getToken: () => 't0k',
      adapter: async req => (seen.push(req), { status: 200, data: [] }),
    });
    await api.products.list();
    expect(seen[0]).toMatchObject({ method: 'GET', url: 'https://api.example.com/products', headers: { 'X-Gym-Id': 'benchmark', Authorization: 'Bearer t0k' } });
  });

  it('4xx 抛出 ApiError', async () => {
    const api = createApi({ baseURL: '', gymId: 'g', adapter: async () => ({ status: 409, data: { code: 'already-claimed' } }) });
    await expect(api.shares.claim('s1')).rejects.toBeInstanceOf(ApiError);
  });
});
