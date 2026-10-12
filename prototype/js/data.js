/* BENCHMARK 攀岩馆原型 — 共享数据层
 * 小程序两部手机和管理后台读写同一个 S 对象，所以在手机上的操作会实时出现在后台。
 */

// ---------- 工具 ----------
const DAY = 86400000;
const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const pad = n => String(n).padStart(2, '0');
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const fmtMD = d => `${d.getMonth() + 1}月${d.getDate()}日`;
const fmtDot = k => k.replaceAll('-', '.');
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const endOfMonth = d => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const daysLeft = k => Math.round((parseKey(k) - TODAY) / DAY);
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const yuan = n => '¥' + Math.round(n).toLocaleString('zh-CN');
const wan = n => n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + '万' : Math.round(n).toLocaleString('zh-CN');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let _seq = 1000;
const newId = p => p + (++_seq);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const greet = () => { const h = new Date().getHours(); return h < 5 ? '晚上好' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'; };
// 营业时间 10:00–23:00；闭馆后按全天数据展示
const openHour = () => { const h = new Date().getHours(); return h >= 10 && h <= 22 ? h : 22; };

const CAT = { period: '期限卡', count: '次卡', pt: '私教课', class: '团课', event: '活动' };
const CAT_ORDER = ['period', 'count', 'pt', 'class', 'event'];
const CAT_COLOR = { period: 'var(--s1)', count: 'var(--s2)', pt: 'var(--s3)', class: 'var(--s4)', event: 'var(--s5)' };

// ---------- 静态目录 ----------
const PRODUCTS_SEED = [
  { id: 'm1', cat: 'period', name: '月卡', price: 599, days: 30, desc: '30 天内不限次入场', perks: ['每月 1 次老带新', '可冻结 7 天'] },
  { id: 'm3', cat: 'period', name: '季卡', price: 1599, orig: 1797, days: 90, desc: '90 天内不限次入场', perks: ['每月 1 次老带新', '可冻结 15 天'], tag: '省 ¥198' },
  { id: 'y1', cat: 'period', name: '年卡', price: 4999, orig: 7188, days: 365, desc: '365 天内不限次入场', perks: ['每月 1 次老带新', '可冻结 30 天', '送 2 节私教体验'], tag: '最划算' },
  { id: 'c10', cat: 'count', name: '10 次卡', price: 899, times: 10, months: 6, desc: '6 个月内有效，约 ¥90/次', perks: ['可以分次送给朋友', '同一天进出多次只扣 1 次'] },
  { id: 'c20', cat: 'count', name: '20 次卡', price: 1599, times: 20, months: 12, desc: '12 个月内有效，约 ¥80/次', perks: ['可以分次送给朋友', '同一天进出多次只扣 1 次'], tag: '常客之选' },
  { id: 's1', cat: 'count', name: '单次票', price: 108, times: 1, months: 0, desc: '购买当天有效', perks: ['含攀岩鞋租借'] },
  { id: 'pt1', cat: 'pt', name: '私教体验课', price: 299, sessions: 1, months: 1, desc: '1 节 60 分钟，每人限购 1 次', perks: ['任选教练', '零基础友好'] },
  { id: 'pt5', cat: 'pt', name: '私教 5 节', price: 1980, sessions: 5, months: 3, desc: '约 ¥396/节，3 个月内有效', perks: ['可约任意教练'] },
  { id: 'pt10', cat: 'pt', name: '私教 10 节', price: 3680, sessions: 10, months: 6, desc: '约 ¥368/节，6 个月内有效', perks: ['可约任意教练', '送个人训练计划'], tag: '热卖' },
  { id: 'g10', cat: 'class', name: '团课 10 次', price: 1080, sessions: 10, months: 4, desc: '约 ¥108/次，4 个月内有效', perks: ['满员时优先候补'] },
  { id: 'g20', cat: 'class', name: '团课 20 次', price: 1980, sessions: 20, months: 8, desc: '约 ¥99/次，8 个月内有效', perks: ['满员时优先候补', '可带 1 位朋友试课'] },
];
const CLASS_SINGLE_PRICE = 128;

const COACHES = [
  { id: 'max', name: 'Max', ab: 'Max', tags: ['抱石', '力量训练'], years: 9, price: 420, rating: 4.9, tone: 'olive', bio: '前省队抱石选手。擅长帮人突破平台期，课上会拍视频逐帧拆动作。' },
  { id: 'may', name: '阿May', ab: 'May', tags: ['先锋攀登', '保护技术'], years: 7, price: 420, rating: 4.9, tone: 'chalk', bio: '持证先锋保护教练。想从抱石转先锋，从她这里开始最稳。' },
  { id: 'zhou', name: '老周', ab: '周', tags: ['青少年', '零基础'], years: 12, price: 360, rating: 5.0, tone: 'volume', bio: '带过三百多个小朋友上墙，耐心出了名。第一次摸岩点也不用紧张。' },
  { id: 'kiki', name: 'Kiki', ab: 'Kiki', tags: ['动作技术', '柔韧'], years: 5, price: 380, rating: 4.8, tone: 'white', bio: '舞蹈出身，教你用脚和髋发力，而不是只靠手臂硬拉。' },
];
const PT_HOURS = [10, 11, 14, 15, 16, 17, 19, 20];

const CLASS_TEMPLATES = [
  { name: '亲子攀岩', level: '入门', coach: 'zhou', start: '10:00', end: '11:30', cap: 8, days: [6, 0] },
  { name: '先锋攀登体验', level: '进阶', coach: 'may', start: '14:00', end: '16:00', cap: 6, days: [6, 0, 3] },
  { name: '抱石动作工作坊', level: '进阶', coach: 'max', start: '16:30', end: '18:00', cap: 8, days: [6, 0] },
  { name: '拉伸与灵活性', level: '全部', coach: 'kiki', start: '18:30', end: '19:30', cap: 12, days: [2, 4, 6] },
  { name: '抱石入门', level: '入门', coach: 'kiki', start: '19:00', end: '20:30', cap: 8, days: [1, 3, 5, 0] },
  { name: '核心与指力', level: '进阶', coach: 'max', start: '20:00', end: '21:00', cap: 10, days: [1, 2, 4, 5] },
];

function nextWeekday(wd) { for (let i = 0; i < 7; i++) { const d = addDays(TODAY, i); if (d.getDay() === wd) return d; } return TODAY; }
const EVENT_TONES = ['olive', 'chalk', 'volume', 'ink'];

// ---------- 状态 ----------
let S;

function seedState() {
  const r = rng(20261010);
  const classes = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(TODAY, i);
    CLASS_TEMPLATES.filter(t => t.days.includes(d.getDay())).forEach(t => {
      const fill = i === 0 ? 0.65 + r() * 0.35 : 0.25 + r() * 0.7;
      classes.push({ id: newId('k'), date: dkey(d), name: t.name, level: t.level, coach: t.coach, start: t.start, end: t.end, cap: t.cap, booked: Math.min(t.cap, Math.round(t.cap * fill)), members: [] });
    });
  }
  classes.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  // 私教已被占用的时段
  const ptTaken = {};
  COACHES.forEach(c => { for (let i = 0; i < 7; i++) PT_HOURS.forEach(h => { if (r() < 0.38) ptTaken[`${c.id}|${dkey(addDays(TODAY, i))}|${h}`] = true; }); });

  const fri = nextWeekday(5);
  const events = [
    { id: 'e1', title: '周五夜爬', date: dkey(fri), start: '20:00', end: '23:00', fee: 0, cap: 80, joined: 37, tone: 'ink', area: '全馆', desc: '每周五晚上的固定节目：DJ、披萨，还有当周的新线路。会员免费参加，记得带上朋友。', members: [] },
    { id: 'e2', title: '新线路开放日', date: dkey(addDays(TODAY, 8)), start: '15:00', end: '17:00', fee: 0, cap: 30, joined: 22, tone: 'volume', area: 'B 区抱石墙', desc: '定线师现场讲线。B 区 14 条新线，难度 V0–V7，开放日当天先爬为快。', members: [] },
    { id: 'e3', title: '秋季抱石积分赛', date: dkey(addDays(TODAY, 15)), start: '13:00', end: '18:00', fee: 120, cap: 64, joined: 41, tone: 'olive', area: 'A/B 区', desc: '分为入门组、进阶组和公开组，3 小时自由积分赛，前三名有奖品。报名费含当天入场。', members: [] },
    { id: 'e4', title: '户外岩场一日行', date: dkey(addDays(TODAY, 29)), start: '07:30', end: '19:00', fee: 380, cap: 16, joined: 9, tone: 'chalk', area: '城郊岩场（大巴集合）', desc: '含往返大巴、装备和教练保护。需要能在馆内完成 5.9 难度的顶绳线路。', members: [] },
  ];

  // 阿杰本月的到店记录（今天之前）
  const visits = [];
  for (let d = 1; d < TODAY.getDate(); d++) if ([1, 3, 4, 6, 8, 9, 11, 13, 15, 16, 18, 20, 22, 23, 25, 27].includes(d)) visits.push(d);

  const yearStart = addDays(TODAY, -209);
  const users = {
    jie: {
      id: 'jie', name: '阿杰', initial: '杰', phone: '138****2046', tone: 'olive', role: '年卡会员',
      cards: [
        { id: 'cj1', kind: 'period', pid: 'y1', name: '年卡', start: dkey(yearStart), end: dkey(addDays(yearStart, 364)) },
        { id: 'cj2', kind: 'count', pid: 'c10', name: '10 次卡', total: 10, left: 6, end: dkey(addDays(TODAY, 118)) },
        { id: 'cj3', kind: 'pt', pid: 'pt5', name: '私教 5 节', total: 5, left: 3, end: dkey(addDays(TODAY, 52)) },
        { id: 'cj4', kind: 'class', pid: 'g10', name: '团课 10 次', total: 10, left: 7, end: dkey(addDays(TODAY, 86)) },
      ],
      log: { cj2: [{ t: '9月27日', text: '入场', d: -1 }, { t: '9月14日', text: '送给 豆豆 1 次', d: -1 }, { t: '8月30日', text: '入场', d: -1 }, { t: '8月2日', text: '购买 10 次卡', d: +10 }] },
      referralMonth: null, visits, totalVisits: 86, bookings: [], checkins: [],
    },
    lu: {
      id: 'lu', name: '小鹿', initial: '鹿', phone: '186****7731', tone: 'chalk', role: '第一次来',
      cards: [], log: {}, referralMonth: null, visits: [], totalVisits: 0, bookings: [], checkins: [],
    },
  };

  return {
    products: PRODUCTS_SEED.map(p => ({ ...p, on: true })),
    classes, ptTaken, events, users,
    shares: [], orders: [], checkins: [], feed: [],
    chats: {
      lu: [{ from: 'jie', type: 'text', text: '周末来爬墙吗？我带你', time: '昨天 21:14' }, { from: 'lu', type: 'text', text: '好啊！但我一次都没爬过😂', time: '昨天 21:16' }],
      jie: [{ from: 'jie', type: 'text', text: '周末来爬墙吗？我带你', time: '昨天 21:14' }, { from: 'lu', type: 'text', text: '好啊！但我一次都没爬过😂', time: '昨天 21:16' }],
    },
    unread: { jie: 0, lu: 0 },
  };
}

// ---------- 后台用的历史模拟数据（只生成一次） ----------
const BASE = (() => {
  const r = rng(77);
  // 近 30 天营收，按品类
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(TODAY, -i);
    const wk = d.getDay() === 0 || d.getDay() === 6 ? 1.45 : 1;
    const partial = i === 0 ? 0.78 : 1;
    const v = {
      period: Math.round((1800 + r() * 3200 + (r() < 0.22 ? 4999 : 0)) * wk * partial),
      count: Math.round((1500 + r() * 1700) * wk * partial),
      pt: Math.round((900 + r() * 1500) * (wk > 1 ? 1.2 : 1) * partial),
      class: Math.round((450 + r() * 700) * wk * partial),
      event: Math.round((r() < 0.3 ? 600 + r() * 2400 : r() * 240) * partial),
    };
    days.push({ key: dkey(d), date: d, ...v });
  }
  const mtd = { period: 0, count: 0, pt: 0, class: 0, event: 0 };
  days.filter(d => d.date.getMonth() === TODAY.getMonth()).forEach(d => CAT_ORDER.forEach(c => mtd[c] += d[c]));
  // 上月同期，用来算环比
  const lastMtd = {};
  CAT_ORDER.forEach(c => lastMtd[c] = Math.round(mtd[c] * (0.82 + r() * 0.3)));

  // 近 12 个月营收
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = addMonths(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1), -i);
    const season = [0.82, 0.78, 0.9, 1.02, 1.08, 1.1, 1.18, 1.22, 1.05, 1.12, 1.06, 0.95][d.getMonth()];
    const total = i === 0 ? CAT_ORDER.reduce((s, c) => s + mtd[c], 0) : Math.round(232000 * season * (0.92 + r() * 0.16) * (1 + (11 - i) * 0.012));
    months.push({ label: `${d.getMonth() + 1}月`, year: d.getFullYear(), total, partial: i === 0 });
  }

  // 今日分时段入场 10:00–22:00
  const curve = [3, 4, 5, 3, 4, 6, 8, 9, 12, 16, 15, 11, 6];
  const hours = curve.map((c, i) => ({ h: 10 + i, n: Math.max(1, Math.round(c * (0.75 + r() * 0.5))) }));

  const NAMES = ['林小满', '陈一鸣', '王朵朵', '赵子轩', '周舟', '吴越', '郑好', '孙婷', '李想', '何夕', '许多', '高远', '宋雨', '唐果', '韩梅', '曹冬', '夏天', '彭湃', '苏晓', '叶子', '罗兰', '梁辰', '谢婉', '蒋鹏', '沈星', '杜若', '田甜', '姜山', '范宁', '方圆', '石磊', '秦川', '白露', '邓凯', '豆豆', '阿伟'];
  const CARD_TYPES = [['年卡', 'period'], ['季卡', 'period'], ['月卡', 'period'], ['10 次卡', 'count'], ['20 次卡', 'count']];
  const SOURCES = ['自己来的', '自己来的', '自己来的', '老带新', '好友送次卡', '点评/小红书'];
  const members = NAMES.map((name, i) => {
    const [card, kind] = CARD_TYPES[Math.floor(r() * CARD_TYPES.length)];
    let expire = Math.round(r() * 300) - 10;
    if (i < 5) expire = 1 + i; // 保证有几个即将到期
    const last = i < 5 ? Math.round(r() * 5) : Math.round(r() * r() * 45);
    return {
      name, phone: `1${3 + Math.floor(r() * 6)}${Math.floor(r() * 10)}****${pad(Math.floor(r() * 100))}${pad(Math.floor(r() * 100))}`,
      card, kind, expire: dkey(addDays(TODAY, expire)),
      left: kind === 'count' ? Math.max(0, Math.round(r() * (card === '20 次卡' ? 20 : 10))) : null,
      month: last > 30 ? 0 : Math.round(r() * 12),
      last: dkey(addDays(TODAY, -last)),
      source: SOURCES[Math.floor(r() * SOURCES.length)],
    };
  });

  // 今天已经发生的入场
  const methods = ['年卡', '季卡', '月卡', '10 次卡 扣 1 次', '20 次卡 扣 1 次', '单次票', '好友送的次卡', '老带新'];
  const lastH = openHour();
  const checkins = [];
  for (let i = 0; i < 14; i++) {
    const h = 10 + Math.floor(r() * (lastH - 10 + 1));
    checkins.push({ time: `${pad(h)}:${pad(Math.floor(r() * 60))}`, name: NAMES[Math.floor(r() * NAMES.length)], method: methods[Math.floor(r() * methods.length)] });
  }
  checkins.sort((a, b) => b.time.localeCompare(a.time));

  // 最近订单
  const prods = PRODUCTS_SEED;
  const orders = [];
  for (let i = 0; i < 16; i++) {
    const p = prods[Math.floor(r() * prods.length)];
    const dayAgo = Math.floor(i / 5);
    orders.push({ id: 'BM' + dkey(addDays(TODAY, -dayAgo)).replaceAll('-', '').slice(2) + pad(40 - i * 2), when: dayAgo === 0 ? `今天 ${pad(21 - i)}:${pad(Math.floor(r() * 60))}` : `${fmtMD(addDays(TODAY, -dayAgo))}`, name: NAMES[Math.floor(r() * NAMES.length)], product: p.name, cat: p.cat, amount: p.price, pay: r() < 0.9 ? '微信支付' : '前台 POS', status: r() < 0.06 ? '已退款' : '已支付' });
  }

  const shares = [
    { time: '昨天 19:20', from: '林小满', kind: 'referral', what: '老带新', to: '她的同事', status: 'used' },
    { time: '昨天 12:05', from: '陈一鸣', kind: 'count', what: '10 次卡 × 2 次', to: '阿伟', status: 'claimed' },
    { time: `${fmtMD(addDays(TODAY, -2))}`, from: '王朵朵', kind: 'referral', what: '老带新', to: '—', status: 'pending' },
    { time: `${fmtMD(addDays(TODAY, -3))}`, from: '周舟', kind: 'count', what: '20 次卡 × 1 次', to: '豆豆', status: 'used' },
  ];

  return {
    days, mtd, lastMtd, months, hours, members, checkins, orders, shares,
    funnel: { sent: 52, claimed: 44, visited: 31, bought: 12 },
    activeMembers: { period: 186, count: 126 }, newMembers: 38, deferred: 486320, refunds: 1798,
  };
})();

// ---------- 读取 ----------
const product = id => S.products.find(p => p.id === id);
const coach = id => COACHES.find(c => c.id === id);
const userName = id => S.users[id]?.name ?? id;
const todayKey = () => dkey(TODAY);
const checkedInToday = uid => S.users[uid].checkins.length > 0;
const periodCard = uid => S.users[uid].cards.find(c => c.kind === 'period' && c.start <= todayKey() && c.end >= todayKey());
const canRefer = uid => !!periodCard(uid) && S.users[uid].referralMonth !== monthKey(TODAY);

function pushFeed(kind, text) { S.feed.unshift({ kind, text, time: nowHM(), at: Date.now() }); }
function addOrder(uid, name, cat, amount) {
  const o = { id: 'BM' + todayKey().replaceAll('-', '').slice(2) + (++_seq), when: `今天 ${nowHM()}`, name: userName(uid), product: name, cat, amount, pay: '微信支付', status: '已支付', demo: true };
  S.orders.unshift(o);
  pushFeed('order', `${userName(uid)} 购买了 ${name}，${yuan(amount)}`);
  return o;
}

// ---------- 写入 ----------
function buyProduct(uid, pid) {
  const p = product(pid), u = S.users[uid];
  let card;
  if (p.cat === 'period') {
    const cur = periodCard(uid);
    const start = cur ? addDays(parseKey(cur.end), 1) : TODAY;
    card = { id: newId('c'), kind: 'period', pid, name: p.name, start: dkey(start), end: dkey(addDays(start, p.days - 1)) };
  } else if (p.cat === 'count') {
    card = { id: newId('c'), kind: 'count', pid, name: p.name, total: p.times, left: p.times, end: dkey(p.months ? addMonths(TODAY, p.months) : TODAY) };
  } else {
    card = { id: newId('c'), kind: p.cat, pid, name: p.name, total: p.sessions, left: p.sessions, end: dkey(addMonths(TODAY, p.months)) };
  }
  u.cards.unshift(card);
  u.log[card.id] = [{ t: '今天', text: `购买 ${p.name}`, d: card.total ? +card.total : 0 }];
  addOrder(uid, p.name, p.cat, p.price);
  return card;
}

function entryOptions(uid) {
  const u = S.users[uid], t = todayKey(), opts = [];
  u.cards.forEach(c => {
    if (c.kind === 'period' && c.start <= t && c.end >= t) opts.push({ cardId: c.id, ok: true, title: c.name, sub: `有效期至 ${fmtDot(c.end)}，不扣次` });
    if ((c.kind === 'count' || c.kind === 'gift') && c.left > 0 && c.end >= t) opts.push({ cardId: c.id, ok: true, title: c.kind === 'gift' ? `${userName(c.from)} 送的次卡` : c.name, sub: `剩 ${c.left} 次，这次扣 1 次` });
    if (c.kind === 'referral' && !c.used && c.end >= t) {
      const inv = S.users[c.from].checkins[0];
      opts.push({ cardId: c.id, ok: !!inv, title: '老带新体验券', sub: inv ? `${userName(c.from)} 今天 ${inv.time} 已入场，可以免费进` : `要等 ${userName(c.from)} 今天先扫码入场`, referral: true });
    }
  });
  return opts;
}

function doCheckin(uid, cardId) {
  const u = S.users[uid], c = u.cards.find(x => x.id === cardId);
  let label = c.name, method = c.name;
  if (c.kind === 'count' || c.kind === 'gift') {
    c.left -= 1;
    (u.log[c.id] ||= []).unshift({ t: '今天', text: '入场', d: -1 });
    label = c.kind === 'gift' ? `${userName(c.from)} 送的次卡` : c.name;
    method = c.kind === 'gift' ? `好友送的次卡（${userName(c.from)}）` : `${c.name} 扣 1 次`;
  }
  if (c.kind === 'referral') {
    c.used = true;
    const sh = S.shares.find(s => s.id === c.shareId); if (sh) sh.status = 'used';
    label = '老带新体验券'; method = `老带新（邀请人 ${userName(c.from)}）`;
  }
  const rec = { id: newId('in'), time: nowHM(), cardId, label, left: c.left, kind: c.kind, from: c.from };
  u.checkins.unshift(rec);
  if (!u.visits.includes(TODAY.getDate())) u.visits.push(TODAY.getDate());
  u.totalVisits += 1;
  S.checkins.unshift({ time: rec.time, name: u.name, method, demo: true });
  pushFeed('in', `${u.name} 入场，${method}`);
  return rec;
}

function sendShare(uid, payload, to) {
  // payload: {kind:'count', cardId, qty} | {kind:'referral'}
  const u = S.users[uid];
  const sh = { id: newId('sh'), kind: payload.kind, from: uid, to: null, toName: to, status: 'pending', time: nowHM() };
  if (payload.kind === 'count') {
    const c = u.cards.find(x => x.id === payload.cardId);
    c.left -= payload.qty;
    (u.log[c.id] ||= []).unshift({ t: '今天', text: `送给 ${to} ${payload.qty} 次`, d: -payload.qty });
    Object.assign(sh, { qty: payload.qty, cardName: c.name, end: c.end });
    pushFeed('share', `${u.name} 把 ${c.name} 的 ${payload.qty} 次送给了 ${to}`);
  } else {
    u.referralMonth = monthKey(TODAY);
    sh.end = dkey(endOfMonth(TODAY));
    pushFeed('share', `${u.name} 发出了本月的老带新邀请`);
  }
  S.shares.unshift(sh);
  const target = Object.values(S.users).find(x => x.name === to);
  if (target) {
    sh.toUid = target.id;
    const msg = { from: uid, type: 'mp', shareId: sh.id, time: nowHM() };
    S.chats[target.id].push(msg);
    S.chats[uid].push(msg);
    S.unread[target.id] += 1;
  }
  return sh;
}

function claimShare(uid, shareId) {
  const sh = S.shares.find(s => s.id === shareId), u = S.users[uid];
  if (!sh) return { err: '这个链接已经失效了' };
  if (sh.from === uid) return { err: '这是你自己发出的，发给朋友让 TA 来领吧' };
  if (sh.status !== 'pending') return { err: sh.to === uid ? '你已经领过了，去卡包里看看' : '已经被别人领走了' };
  sh.status = 'claimed'; sh.to = uid;
  let card;
  if (sh.kind === 'count') card = { id: newId('g'), kind: 'gift', name: '好友送的次卡', from: sh.from, total: sh.qty, left: sh.qty, end: sh.end, shareId };
  else card = { id: newId('r'), kind: 'referral', name: '老带新体验券', from: sh.from, end: sh.end, used: false, shareId };
  u.cards.unshift(card);
  pushFeed('claim', `${u.name} 领取了 ${userName(sh.from)} 的${sh.kind === 'count' ? `次卡 ${sh.qty} 次` : '老带新邀请'}`);
  return { card };
}

function bookClass(uid, classId, pay) {
  const k = S.classes.find(x => x.id === classId), u = S.users[uid];
  k.booked += 1; k.members.push(uid);
  if (pay === 'card') { const c = u.cards.find(x => x.kind === 'class' && x.left > 0); c.left -= 1; (u.log[c.id] ||= []).unshift({ t: '今天', text: `预约 ${k.name}`, d: -1 }); }
  else addOrder(uid, `团课 ${k.name}`, 'class', CLASS_SINGLE_PRICE);
  u.bookings.unshift({ id: newId('b'), kind: 'class', refId: classId, date: k.date, time: `${k.start}–${k.end}`, title: k.name, who: coach(k.coach).name });
  pushFeed('book', `${u.name} 预约了 ${fmtMD(parseKey(k.date))} ${k.start} 的 ${k.name}`);
}
function cancelClass(uid, classId) {
  const k = S.classes.find(x => x.id === classId), u = S.users[uid];
  k.booked -= 1; k.members = k.members.filter(m => m !== uid);
  u.bookings = u.bookings.filter(b => b.refId !== classId);
  const c = u.cards.find(x => x.kind === 'class'); if (c) c.left += 1;
}
function bookPt(uid, coachId, day, hour, pay) {
  const u = S.users[uid], co = coach(coachId);
  S.ptTaken[`${coachId}|${day}|${hour}`] = uid;
  if (pay === 'card') { const c = u.cards.find(x => x.kind === 'pt' && x.left > 0); c.left -= 1; (u.log[c.id] ||= []).unshift({ t: '今天', text: `预约 ${co.name} 私教`, d: -1 }); }
  else addOrder(uid, `私教 ${co.name} 1 节`, 'pt', co.price);
  u.bookings.unshift({ id: newId('b'), kind: 'pt', refId: `${coachId}|${day}|${hour}`, date: day, time: `${pad(hour)}:00–${pad(hour + 1)}:00`, title: `${co.name} 的私教课`, who: co.name });
  pushFeed('book', `${u.name} 约了 ${co.name} ${fmtMD(parseKey(day))} ${pad(hour)}:00 的私教课`);
}
function joinEvent(uid, eventId) {
  const e = S.events.find(x => x.id === eventId), u = S.users[uid];
  e.joined += 1; e.members.push(uid);
  if (e.fee > 0) addOrder(uid, `活动 ${e.title}`, 'event', e.fee);
  u.bookings.unshift({ id: newId('b'), kind: 'event', refId: eventId, date: e.date, time: `${e.start}–${e.end}`, title: e.title, who: e.area });
  pushFeed('book', `${u.name} 报名了 ${e.title}`);
}

S = seedState();
