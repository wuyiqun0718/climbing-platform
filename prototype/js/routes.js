/* 定线分析：三个分馆每批换线前后的客流对比
 *
 * 计算口径（后台页面上也会写给店长看）：
 * - 换线前：换线日前 14 天的日均入场
 * - 换线后：换线日后 N 天（7 / 14 / 28 可选），遇到这个分馆的下一次换线就截止
 * - 提升 = 换线后 ÷ 换线前 − 1
 * - 同期其他分馆 = 另外两个分馆在相同日期窗口里的变化，代表节假日、天气、季节这些全馆共有的因素
 * - 净提升 = 提升 − 同期其他分馆，用来比较「这批线本身」的吸引力
 * - 热度持续：换线后客流回落到换线前 +5% 以内用了几天
 * 星期几的差异已校正（周末本来人多，不能算成新线的功劳）。
 *
 * 原型里每日入场是模拟出来的；正式版直接用扫码入场记录（每条记录带分馆）和后台登记的换线批次。
 */

const RouteSets = (() => {
  const BRANCHES = [
    { id: 'bingang', name: '滨港店', color: 'var(--s1)', base: 118, walls: ['A 区抱石墙', 'B 区抱石墙', '仰角区', '顶绳区'] },
    { id: 'huiju', name: '汇聚店', color: 'var(--s2)', base: 86, walls: ['主墙', '平板区', '洞穴区'] },
    { id: 'huanqiugang', name: '环球港店', color: 'var(--s3)', base: 64, walls: ['抱石墙', '训练墙'] },
  ];
  const branch = id => BRANCHES.find(b => b.id === id);
  const GRADES = ['V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8'];
  const BEFORE = 14;
  // 模拟数据以最近一次国庆（10 月 1 日）为锚点，换线批次也按它排，哪天打开演示，日期和结论都一样
  const OCT1 = (() => { const y = TODAY.getFullYear(); return TODAY >= new Date(y, 9, 8) ? new Date(y, 9, 1) : new Date(y - 1, 9, 1); })();
  const SINCE_OCT1 = Math.round((TODAY - OCT1) / DAY);
  const DAYS = Math.max(200, SINCE_OCT1 + 190); // 模拟的历史天数；下标 DAYS 是今天，DAYS - 1 是昨天
  const H0 = DAYS - SINCE_OCT1; // 10 月 1 日的下标
  const keyAt = i => dkey(addDays(TODAY, i - DAYS));
  const dowAt = i => addDays(TODAY, i - DAYS).getDay();
  const HOLIDAY = { from: H0, to: H0 + 6 };
  const holidayName = '国庆假期';

  // off：换线日相对 10 月 1 日的天数；q：这批线的「吸引力」，只用来生成模拟数据，页面上不展示
  const SEED = [
    { branch: 'bingang', off: -14, q: 0.85, area: 'A 区抱石墙', theme: '脚法与平衡', setters: ['阿凯', '小葵'], routes: 16 },
    { branch: 'bingang', off: -44, q: 0.38, area: '仰角区', theme: '指力小点', setters: ['Max'], routes: 12 },
    { branch: 'bingang', off: -74, q: 0.7, area: 'B 区抱石墙', theme: '动态跳跃', setters: ['大熊', '阿凯'], routes: 15 },
    { branch: 'bingang', off: -105, q: 0.18, area: '顶绳区', theme: '耐力长线', setters: ['Momo'], routes: 10 },
    { branch: 'bingang', off: -135, q: 0.6, area: 'A 区抱石墙', theme: '比赛风格', setters: ['Max', '小葵'], routes: 14 },
    { branch: 'bingang', off: -165, q: 0.5, area: 'B 区抱石墙', theme: '入门友好', setters: ['阿凯'], routes: 18 },
    { branch: 'huiju', off: -1, q: 0.22, area: '主墙', theme: '综合', setters: ['Momo'], routes: 14 },
    { branch: 'huiju', off: -31, q: 0.78, area: '洞穴区', theme: '仰角力量', setters: ['大熊'], routes: 12 },
    { branch: 'huiju', off: -61, q: 0.35, area: '平板区', theme: '技术型平板', setters: ['小葵'], routes: 11 },
    { branch: 'huiju', off: -92, q: 0.55, area: '主墙', theme: '动态跳跃', setters: ['大熊', 'Momo'], routes: 15 },
    { branch: 'huiju', off: -122, q: 0.08, area: '平板区', theme: '指力小点', setters: ['Max'], routes: 9 },
    { branch: 'huiju', off: -152, q: 0.62, area: '洞穴区', theme: '入门友好', setters: ['小葵'], routes: 16 },
    { branch: 'huanqiugang', off: 7, q: 0.62, area: '抱石墙', theme: '入门友好', setters: ['阿凯'], routes: 13 },
    { branch: 'huanqiugang', off: -24, q: 0.28, area: '训练墙', theme: '指力小点', setters: ['Max'], routes: 10 },
    { branch: 'huanqiugang', off: -54, q: 0.92, area: '抱石墙', theme: '比赛风格', setters: ['大熊', '小葵'], routes: 14 },
    { branch: 'huanqiugang', off: -84, q: 0.45, area: '抱石墙', theme: '脚法与平衡', setters: ['Momo'], routes: 12 },
    { branch: 'huanqiugang', off: -114, q: 0.12, area: '训练墙', theme: '耐力长线', setters: ['阿凯'], routes: 8 },
    { branch: 'huanqiugang', off: -145, q: 0.5, area: '抱石墙', theme: '动态跳跃', setters: ['大熊'], routes: 13 },
  ];

  // 难度分布：主题决定集中在哪一段
  const GRADE_CENTER = { 入门友好: 1.5, 脚法与平衡: 3, 技术型平板: 3.2, 综合: 3.2, 动态跳跃: 3.8, 耐力长线: 3.5, 仰角力量: 4.5, 指力小点: 4.8, 比赛风格: 5 };
  function gradesFor(theme, n, r) {
    const c = GRADE_CENTER[theme] ?? 3.5, w = GRADES.map((_, g) => Math.exp(-((g - c) ** 2) / 4.5) * (0.75 + r() * 0.5));
    const sum = w.reduce((a, b) => a + b, 0), counts = w.map(x => Math.floor(x / sum * n));
    for (let k = 0; counts.reduce((a, b) => a + b, 0) < n; k++) counts[Math.round(c + (k % 3) - 1)] += 1;
    return counts;
  }

  // ---------- 生成每日入场 ----------
  const r = rng(1013);
  const base = SEED.map((s, i) => ({ ...s, id: `rs${i}`, date: keyAt(H0 + s.off), idx: H0 + s.off, grades: gradesFor(s.theme, s.routes, r) }));
  const WF = [1.38, 0.86, 0.95, 0.97, 1.0, 1.14, 1.48]; // 周日 … 周六
  const effectAt = (b, i) => {
    const last = base.filter(s => s.branch === b && s.idx <= i).sort((a, c) => c.idx - a.idx)[0];
    if (!last) return 0;
    const t = i - last.idx;
    if (t === 0) return -0.45; // 换线当天部分区域封闭
    return (0.03 + 0.27 * last.q) * Math.exp(-(t - 1) / (3 + 10 * last.q));
  };
  const raw = {};
  BRANCHES.forEach(b => (raw[b.id] = []));
  for (let i = 0; i <= DAYS; i++) {
    const season = 1 + 0.06 * Math.sin((i / DAYS) * Math.PI * 1.6) + i / DAYS * 0.05;
    const hol = i >= HOLIDAY.from && i <= HOLIDAY.to ? 1.3 : 1;
    BRANCHES.forEach(b => {
      // 其他分馆换了新线，会从这里吸走一点人
      const pull = BRANCHES.filter(o => o.id !== b.id).reduce((s, o) => s + Math.max(0, effectAt(o.id, i)), 0) * 0.08;
      const noise = 0.92 + r2(`${b.id}|${keyAt(i)}`) * 0.16; // 按日期取随机数，哪天打开都一样
      raw[b.id].push(Math.round(b.base * WF[dowAt(i)] * season * hol * (1 + effectAt(b.id, i)) * (1 - pull) * noise));
    });
  }
  // 星期几校正系数：用每个分馆自己的历史估出来
  const wf = {};
  BRANCHES.forEach(b => {
    const by = [0, 0, 0, 0, 0, 0, 0].map(() => []);
    raw[b.id].slice(0, DAYS).forEach((v, i) => by[dowAt(i)].push(v));
    const mean = raw[b.id].slice(0, DAYS).reduce((a, c) => a + c, 0) / DAYS;
    wf[b.id] = by.map(a => a.reduce((x, y) => x + y, 0) / a.length / mean);
  });
  const adj = (b, i) => raw[b][i] / wf[b][dowAt(i)];
  const avg = (b, idxs, f = adj) => idxs.reduce((s, i) => s + f(b, i), 0) / idxs.length;
  const range = (a, z) => Array.from({ length: Math.max(0, z - a + 1) }, (_, k) => a + k);

  // ---------- 计算 ----------
  const all = () => base.concat(S.routeSetsNew || []).sort((a, b) => b.date.localeCompare(a.date));
  const nextIdx = s => {
    const n = base.filter(x => x.branch === s.branch && x.idx > s.idx).sort((a, b) => a.idx - b.idx)[0];
    return n ? n.idx : Infinity;
  };

  /** 以换线前 14 天为基准：本馆指数、同期其他分馆指数、两者之比（扣除节假日等全馆共有因素） */
  function basis(s) {
    const before = range(s.idx - BEFORE, s.idx - 1);
    const b0 = avg(s.branch, before);
    const others = BRANCHES.filter(o => o.id !== s.branch).map(o => ({ id: o.id, b0: avg(o.id, before) }));
    const own = i => adj(s.branch, i) / b0;
    const mkt = i => others.reduce((a, o) => a + adj(o.id, i) / o.b0, 0) / others.length;
    return { before, b0, own, mkt, rel: i => own(i) / mkt(i), lim: Math.min(nextIdx(s) - 1, DAYS - 1) };
  }
  const mean = (idxs, f) => idxs.reduce((a, i) => a + f(i), 0) / idxs.length;

  function analyze(s, N = 14) {
    if (s.pending) return { status: 'pending' };
    const B = basis(s), lim = B.lim;
    const after = range(s.idx + 1, Math.min(s.idx + N, lim));
    if (after.length < 3) return { status: 'early', days: Math.max(0, DAYS - 1 - s.idx) };
    const uplift = mean(after, B.own) - 1, market = mean(after, B.mkt) - 1;
    // 热度持续：扣除同期其他分馆后，3 天平均回落到换线前 +5% 以内
    let heatDays = null;
    for (let t = 1; s.idx + t <= lim; t++) {
      const w = range(Math.max(s.idx + 1, s.idx + t - 1), Math.min(lim, s.idx + t + 1));
      if (mean(w, B.rel) <= 1.05) { heatDays = t; break; }
    }
    const before = B.before;
    const k = 0.5 + r2(s.id) * 0.5;
    return {
      status: after.length < N ? 'partial' : 'done',
      days: after.length,
      beforePerDay: Math.round(avg(s.branch, before, (b, i) => raw[b][i])),
      afterPerDay: Math.round(avg(s.branch, after, (b, i) => raw[b][i])),
      uplift, market, net: uplift - market,
      heatDays, heatOpen: heatDays == null, heatSpan: lim - s.idx,
      // 回访率、跨馆来访：正式版从会员入场记录里算；原型按这批线的吸引力模拟
      returnRate: Math.min(0.75, 0.24 + 0.32 * s.q * k + 0.06),
      cross: Math.round(B.b0 * after.length * (0.03 + 0.11 * s.q) * k),
    };
  }
  /** 由字符串得到 0–1 之间的固定随机数 */
  function r2(id) { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; return (h % 10000) / 10000; }

  /** 热度曲线：换线前 14 天到换线后 28 天，换线前 = 100；已按星期几校正、扣除同期其他分馆的变化，3 天平滑 */
  function curve(s, from = -BEFORE, to = 28) {
    if (s.pending) return [];
    const B = basis(s), lim = B.lim;
    return range(from, to).map(t => {
      const i = s.idx + t;
      if (t === 0 || i > lim || i < 0) return null;
      const lo = t > 0 ? s.idx + 1 : 0, hi = t < 0 ? s.idx - 1 : lim;
      const w = range(Math.max(lo, i - 1), Math.min(hi, i + 1));
      return Math.round(mean(w, B.rel) * 100);
    });
  }

  /** 每个分馆当前这批线的状态 */
  function branchStatus(bid) {
    const sets = all().filter(s => s.branch === bid);
    const cur = sets.find(s => !s.pending);
    const pending = sets.find(s => s.pending);
    const days = DAYS - cur.idx;
    const B = basis(cur);
    const last7 = range(Math.max(cur.idx + 1, DAYS - 7), DAYS - 1);
    const heat = last7.length ? Math.round(mean(last7, B.rel) * 100) : null;
    const done = sets.filter(s => !s.pending && analyze(s).status === 'done').map(s => analyze(s));
    return {
      cur, pending, days, heat,
      spark: curve(cur, 1, days - 1).filter(v => v != null),
      avgNet: done.reduce((a, c) => a + c.net, 0) / (done.length || 1),
      avgHeat: Math.round(done.filter(d => d.heatDays).reduce((a, c) => a + c.heatDays, 0) / (done.filter(d => d.heatDays).length || 1)),
      cooled: days >= 3 && heat != null && heat <= 105,
    };
  }

  function register(f) {
    const s = { id: newId('rs'), branch: f.branch, date: f.date, idx: DAYS + daysLeft(f.date), area: f.area, theme: f.theme || '未填写', setters: f.setters, routes: f.routes, grades: null, pending: true, fresh: true };
    (S.routeSetsNew ||= []).push(s);
    return s;
  }

  /** 这批线的统计窗口（换线前 14 天到换线后 N 天）有没有碰上节假日 */
  function overlapsHoliday(s, N = 14) {
    if (s.pending) return false;
    const a = s.idx - BEFORE, z = Math.min(s.idx + N, nextIdx(s) - 1, DAYS - 1);
    return a <= HOLIDAY.to && z >= HOLIDAY.from;
  }

  return { BRANCHES, branch, GRADES, BEFORE, all, analyze, curve, branchStatus, register, overlapsHoliday, holidayName };
})();
