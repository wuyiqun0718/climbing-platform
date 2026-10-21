import type { StaffRole } from '@climb/api';
import { watch } from 'vue';
import { createRouter, createWebHashHistory, type RouteLocationNormalized } from 'vue-router';
import { onUnauthorized } from './api';
import { canSeePage, type PageKey } from './permissions';
import { session } from './session';

export const NAV: readonly { path: string; name: PageKey; label: string }[] = [
  { path: '/', name: 'dashboard', label: '数据看板' },
  { path: '/finance', name: 'finance', label: '财务' },
  { path: '/members', name: 'members', label: '会员' },
  { path: '/courses', name: 'courses', label: '课程排期' },
  { path: '/events', name: 'events', label: '活动' },
  { path: '/entries', name: 'entries', label: '入场与分享' },
  { path: '/products', name: 'products', label: '卡种与价格' },
  { path: '/staff', name: 'staff', label: '员工' },
];

/** 这个角色能看到的导航 */
export const navFor = (role: StaffRole) => NAV.filter(n => canSeePage(role, n.name));

declare module 'vue-router' {
  interface RouteMeta {
    label?: string;
    /** 不用登录就能看（登录页） */
    public?: boolean;
    /** 权限表里的页面，见 permissions.ts */
    page?: PageKey;
  }
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', meta: { label: '登录', public: true }, component: () => import('./pages/LoginPage.vue') },
    ...NAV.map(n => ({
      path: n.path,
      name: n.name,
      meta: { label: n.label, page: n.name },
      component: n.name === 'dashboard' ? () => import('./pages/DashboardPage.vue') : () => import('./pages/TodoPage.vue'),
    })),
    { path: '/:rest(.*)*', redirect: '/' },
  ],
});

/** 登录后回到原来要去的页面；只接受站内路径 */
export function redirectTarget(q: RouteLocationNormalized['query']['redirect']): string {
  const r = Array.isArray(q) ? q[0] : q;
  return typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/login') ? r : '/';
}

router.beforeEach(to => {
  if (to.meta.public) return to.name === 'login' && session.loggedIn ? redirectTarget(to.query.redirect) : true;
  if (!session.loggedIn) return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };
  // 没权限的页面（直接输地址进来的）回看板；看板所有角色都能看
  if (to.meta.page && session.state.staff && !canSeePage(session.state.staff.role, to.meta.page)) return to.name === 'dashboard' ? true : '/';
  return true;
});

// 后台校验后角色变了（比如被降成前台），当前页没权限就回看板
watch(
  () => session.state.staff?.role,
  role => {
    const page = router.currentRoute.value.meta.page;
    if (role && page && !canSeePage(role, page)) router.replace('/');
  },
);

// 登录过期或账号被停用：清掉会话，回登录页，登录后回到当前页
onUnauthorized(() => {
  if (!session.loggedIn) return;
  session.logout();
  const cur = router.currentRoute.value;
  if (!cur.meta.public) router.replace({ name: 'login', query: cur.fullPath === '/' ? {} : { redirect: cur.fullPath } });
});
