import { defineGym } from '@climb/core';
import { defineTheme } from '@climb/theme';
import meta from '../gym.json';

/** BENCHMARK 攀岩馆。颜色取自标志：橄榄绿底、黑描边、米色木板、灰色岩板。 */
export default defineGym({
  ...meta,
  openHours: { open: '10:00', close: '23:00' },
  theme: defineTheme({
    brand: '#86972f',
    onBrand: '#000000',
    brandStrong: '#5c6a1b',
    brandSoft: '#eaeed3',
    accent: '#e9d1ad',
    accentSoft: '#f6ead8',
    neutral: '#c4c3c8',
    neutralSoft: '#ebebee',
    page: '#f3f4ee',
    fontDisplay: '"ZCOOL QingKe HuangYou", "PingFang SC", sans-serif',
    fontNumber: '"Bricolage Grotesque", -apple-system, "PingFang SC", sans-serif',
  }),
  rules: {
    referralsPerMonth: 1,
    referralRequiresInviterSameDay: true,
  },
});
