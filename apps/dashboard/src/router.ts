import { createRouter, createWebHashHistory } from 'vue-router';

export const NAV = [
  { path: '/', name: 'dashboard', label: '数据看板' },
  { path: '/finance', name: 'finance', label: '财务' },
  { path: '/members', name: 'members', label: '会员' },
  { path: '/courses', name: 'courses', label: '课程排期' },
  { path: '/events', name: 'events', label: '活动' },
  { path: '/entries', name: 'entries', label: '入场与分享' },
  { path: '/products', name: 'products', label: '卡种与价格' },
] as const;

export const router = createRouter({
  history: createWebHashHistory(),
  routes: NAV.map(n => ({
    path: n.path,
    name: n.name,
    meta: { label: n.label },
    component: n.name === 'dashboard' ? () => import('./pages/DashboardPage.vue') : () => import('./pages/TodoPage.vue'),
  })),
});
