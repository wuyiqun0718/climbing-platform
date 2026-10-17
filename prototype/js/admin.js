/* 管理后台原型 */

const Admin = (() => {
  let page = 'dash';
  const ST0 = { memFilter: 'all', memQuery: '', courseTab: 'class', entryTab: 'in', drawer: null, toast: null, priceDraft: {}, rsBranch: 'all', rsWin: 14, rsSel: null, rsSort: 'date', dashStore: 'all' };
  const st = { ...ST0 };
  const NAV = [
    ['dash', '数据看板', 'chart'],
    ['finance', '财务', 'yuan'],
    ['routes', '定线分析', 'hold'],
    ['members', '会员', 'users'],
    ['courses', '课程排期', 'calendar'],
    ['events', '活动', 'flag'],
    ['entries', '入场与分享', 'door'],
    ['products', '卡种与价格', 'tag'],
  ];
  const SERIES = CAT_ORDER.map(c => ({ key: c, name: CAT[c], color: CAT_COLOR[c] }));

  // ---------- 实时指标（历史数据 + 小程序里的演示操作） ----------
  // store：'all' 是全部门店，否则是门店 id；小程序里的演示操作都算在 DEMO_STORE
  const hasDemo = store => store === 'all' || store === DEMO_STORE;
  const inStore = (rec, store) => store === 'all' || rec.store === store;
  const demoOrders = (store = 'all') => (hasDemo(store) ? S.orders : []);
  const mtdByCat = (store = 'all') => {
    const m = {};
    CAT_ORDER.forEach(c => (m[c] = storePart(BASE.mtd[c], store, `mtd|${c}`, c)));
    demoOrders(store).forEach(o => (m[o.cat] += o.amount));
    return m;
  };
  const mtdTotal = (store = 'all') => Object.values(mtdByCat(store)).reduce((a, b) => a + b, 0);
  const lastMtdTotal = (store = 'all') => CAT_ORDER.reduce((s, c) => s + storePart(BASE.lastMtd[c], store, `last|${c}`, c), 0);
  const baseEntriesSoFar = (store = 'all') => BASE.hours.filter(h => h.h <= openHour()).reduce((s, h) => s + storePart(h.n, store, `h|${h.h}`), 0);
  const todayEntries = (store = 'all') => baseEntriesSoFar(store) + S.checkins.filter(c => inStore(c, store)).length;
  const lastWeekSoFar = (store = 'all') => Math.round(baseEntriesSoFar(store) * 0.91);
  const todayBookings = (store = 'all') => {
    const ks = S.classes.filter(k => k.date === todayKey() && inStore(k, store));
    const pt = storePart(Object.keys(S.ptTaken).filter(k => k.split('|')[1] === todayKey()).length, store, `pt|${todayKey()}`);
    return { classes: ks.length, people: ks.reduce((s, k) => s + k.booked, 0), pt };
  };
  const demoNewMembers = (store = 'all') => (hasDemo(store) ? Object.values(S.users).filter(u => u.id !== 'jie' && u.cards.some(c => ['period', 'count'].includes(c.kind) && c.pid !== 's1')).length : 0);
  const activeMembers = (store = 'all') => storePart(BASE.activeMembers.period + BASE.activeMembers.count, store, 'active') + demoNewMembers(store);
  /** 老带新漏斗；到馆和办卡两步取自「新客从哪来」的老带新那一行，两张卡片的数字一致 */
  const funnel = (store = 'all') => {
    const ref = newcomers(store).find(x => x.key === 'referral');
    const f = { sent: storePart(BASE.funnel.sent, store, 'funnel'), claimed: storePart(BASE.funnel.claimed, store, 'funnel'), visited: ref.visitors, bought: ref.bought };
    if (hasDemo(store)) {
      const refs = S.shares.filter(s => s.kind === 'referral');
      f.sent += refs.length; f.claimed += refs.filter(s => s.status !== 'pending').length;
    }
    return f;
  };
  /** 近 30 天每天各品类营收，按门店拆；今天加上小程序里的演示订单 */
  const revenueDays = (store = 'all') => {
    const days = BASE.days.map(d => { const x = { key: d.key, date: d.date }; CAT_ORDER.forEach(c => (x[c] = storePart(d[c], store, `day|${d.key}|${c}`, c))); return x; });
    demoOrders(store).forEach(o => (days[days.length - 1][o.cat] += o.amount));
    return days;
  };
  /** 本月第一次来馆的新客，按来源；小鹿第一次入场、办卡也算进去 */
  const newcomers = (store = 'all') => {
    const rows = BASE.newcomers.map(n => {
      const visitors = storePart(n.visitors, store, `nc|${n.key}`);
      return { ...n, visitors, bought: Math.min(visitors, storePart(n.bought, store, `nc|${n.key}`)) };
    });
    const lu = S.users.lu;
    if (hasDemo(store) && lu.checkins.length) {
      const src = lu.checkins[lu.checkins.length - 1].kind === 'referral' ? 'referral' : lu.checkins[lu.checkins.length - 1].kind === 'gift' ? 'gift' : 'walkin';
      const row = rows.find(x => x.key === src);
      row.visitors += 1;
      if (demoNewMembers(store)) row.bought += 1;
    }
    return rows;
  };
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const delta = (now, before, unit = '%') => {
    const d = unit === '%' ? Math.round((now - before) / before * 100) : now - before;
    const up = d >= 0;
    return `<span class="delta ${up ? 'up' : 'down'}">${icon(up ? 'up' : 'down', 13)}${up ? '+' : ''}${d}${unit}</span>`;
  };
  const dateLine = () => `${TODAY.getFullYear()}年${TODAY.getMonth() + 1}月${TODAY.getDate()}日 ${WEEK[TODAY.getDay()]}`;
  const signPct = v => { const n = Math.round(v * 100); return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`; };

  // ---------- 定线分析 ----------
  /** 当前选中的批次：用户点过的优先，否则选最近一批统计窗口已经完整的 */
  function selectedSet(list) {
    const ok = s => !s.pending && RouteSets.analyze(s, st.rsWin).status !== 'early';
    return list.find(s => s.id === st.rsSel && ok(s))
      || list.find(s => ok(s) && RouteSets.analyze(s, st.rsWin).status === 'done')
      || list.find(ok);
  }
  /** 给店长看的一句话结论 */
  function insightFor(s, a, hol) {
    const tail = a.status === 'partial' ? ` 目前只有 ${a.days} 天的数据，之后还会变。` : '';
    if (a.market >= 0.06 && a.uplift - a.net >= 0.05) {
      return `看着涨了 ${Math.round(a.uplift * 100)}%，但同期其他分馆也涨了 ${Math.round(a.market * 100)}%${hol ? `，主要是${RouteSets.holidayName}带来的` : ''}。扣掉这部分，这批线本身带来的大约是 ${signPct(a.net)}。${tail}`;
    }
    if (a.market <= -0.06 && hol) {
      return `换线前两周正好赶上${RouteSets.holidayName}，各分馆人都多，直接对比会低估这批线。扣除同期其他分馆的变化后，净提升大约是 ${signPct(a.net)}。${tail}`;
    }
    if (a.net >= 0.15) return `这批线明显带动了客流${a.heatDays ? `，热度持续了 ${a.heatDays} 天` : '，热度到现在还没退'}。「${s.theme}」这类线可以多做。${tail}`;
    if (a.net <= 0.03) return `这批线对客流几乎没有带动。可以结合会员反馈，看看是不是难度太集中，或者风格不太受欢迎。${tail}`;
    return `这批线带来了一些客流，属于正常水平。${tail}`;
  }
  const newChip = '<span class="chip new">刚刚</span>';

  // ---------- 外壳 ----------
  function render() {
    const root = document.getElementById('admin');
    if (root.hidden) return;
    const y = scrollY;
    root.innerHTML = `<aside class="side"><div class="side-brand"><img src="assets/mark.png" alt=""><span>门店后台</span></div>
      <nav>${NAV.map(([k, l, ic]) => `<button data-x="nav" data-v="${k}" class="${k === page ? 'on' : ''}" ${k === page ? 'aria-current="page"' : ''}>${icon(ic, 18)}<span>${l}</span></button>`).join('')}</nav>
      <div class="side-user">${holdAvatar('林', 'olive', 32, 0)}<span><b>小林</b><small>店长</small></span></div></aside>
      <section class="main">${PAGES[page]()}</section>
      ${st.drawer ? `<div class="drawer-mask" data-x="closeDrawer"><aside class="drawer" role="dialog" aria-label="${{ class: '发布团课', event: '发布活动', routeset: '登记换线' }[st.drawer]}">${DRAWERS[st.drawer]()}</aside></div>` : ''}
      ${st.toast ? `<div class="a-toast" role="status">${icon('check', 18)}${st.toast}</div>` : ''}`;
    drawCharts();
    scrollTo(0, y);
  }
  function toast(t) { st.toast = t; render(); clearTimeout(st.tt); st.tt = setTimeout(() => { st.toast = null; render(); }, 2600); }

  function drawCharts() {
    const rev = document.getElementById('ch-rev');
    if (rev) {
      const days = revenueDays(st.dashStore);
      Charts.columns(rev, {
        labels: days.map(d => `${d.date.getMonth() + 1}/${d.date.getDate()}`),
        series: SERIES.map(s => ({ ...s, values: days.map(d => d[s.key]) })),
        height: 240, labelEvery: 5, tipTitle: l => l.replace('/', '月') + '日',
      });
    }
    const hrs = document.getElementById('ch-hours');
    if (hrs) {
      const lastH = openHour();
      const vals = BASE.hours.map(h => h.h <= lastH ? storePart(h.n, st.dashStore, `h|${h.h}`) : 0);
      vals[Math.max(0, lastH - 10)] += S.checkins.filter(c => inStore(c, st.dashStore)).length;
      Charts.columns(hrs, {
        labels: BASE.hours.map(h => `${h.h}`), series: [{ name: '入场人数', color: 'var(--s1)', values: vals }],
        height: 200, fmt: v => Math.round(v), tipFmt: v => `${v} 人`, labelEvery: 2, future: lastH - 10, tipTitle: l => `${l}:00–${+l + 1}:00`,
      });
    }
    const cur = document.getElementById('ch-curve');
    if (cur && st.rsShown) {
      const R = RouteSets, sel = R.all().find(s => s.id === st.rsShown), b = R.branch(sel.branch);
      const xs = Array.from({ length: R.BEFORE + 29 }, (_, i) => i - R.BEFORE);
      const others = R.all().filter(s => s.branch === sel.branch && s.id !== sel.id && !s.pending).map(s => R.curve(s));
      const mine = R.curve(sel);
      const avgOthers = i => { const v = others.map(o => o[i]).filter(x => x != null); return v.length ? Math.round(v.reduce((a, c) => a + c, 0) / v.length) : null; };
      const dayName = t => t < 0 ? `换线前 ${-t} 天` : t === 0 ? '换线当天（部分区域封闭）' : `换线后第 ${t} 天`;
      Charts.lines(cur, {
        xs, height: 260, ref: 100, refLabel: '换线前水平', mark: 0, markLabel: '换线', shade: [1, st.rsWin],
        xLabel: t => (t > 0 ? `+${t}` : `${t}`),
        series: others.map(values => ({ name: '以往批次', values })).concat({ name: '这一批', values: mine, color: b.color, focus: true }),
        tip: (t, i) => `<b>${dayName(t)}</b><div class="tip-row"><i style="background:${b.color}"></i><span>这一批</span><b>${mine[i] ?? '—'}</b></div><div class="tip-row"><i style="background:var(--ink-4)"></i><span>以往批次平均</span><b>${avgOthers(i) ?? '—'}</b></div>`,
      });
    }
    const mon = document.getElementById('ch-months');
    if (mon) {
      const ms = BASE.months.map(m => ({ ...m }));
      ms[ms.length - 1].total = mtdTotal();
      Charts.columns(mon, {
        labels: ms.map(m => m.label), series: [{ name: '营收', color: 'var(--s1)', values: ms.map(m => m.total) }],
        height: 240, highlight: ms.length - 1, tipTitle: l => { const m = ms.find(x => x.label === l); return `${m.year}年${l}${m.partial ? '（截至今天）' : ''}`; },
      });
    }
  }

  // ---------- 页面 ----------
  const PAGES = {
    dash() {
      const sto = st.dashStore, all = sto === 'all';
      const m = mtdByCat(sto), total = mtdTotal(sto), lastTotal = lastMtdTotal(sto);
      const f = funnel(sto), tb = todayBookings(sto), nc = newcomers(sto);
      const ncTotal = nc.reduce((a, x) => a + x.visitors, 0), ncBought = nc.reduce((a, x) => a + x.bought, 0);
      const days = revenueDays(sto);
      const revSpark = days.slice(-14).map(d => CAT_ORDER.reduce((a, c) => a + d[c], 0));
      const expiring = BASE.members.filter(x => inStore(x, sto) && x.kind === 'period' && daysLeft(x.expire) >= 0 && daysLeft(x.expire) <= 7).sort((a, b) => a.expire.localeCompare(b.expire));
      const todayClasses = S.classes.filter(k => k.date === todayKey() && inStore(k, sto));
      const baseFeed = [
        { kind: 'in', text: `${BASE.checkins[0].name} 入场，${BASE.checkins[0].method}`, time: BASE.checkins[0].time, store: BASE.checkins[0].store },
        { kind: 'order', text: `${BASE.orders[0].name} 购买了 ${BASE.orders[0].product}，${yuan(BASE.orders[0].amount)}`, time: BASE.orders[0].when.replace('今天 ', ''), store: storeOf(BASE.orders[0].name) },
        { kind: 'share', text: `${BASE.shares[1].from} 把 ${BASE.shares[1].what} 送给了 ${BASE.shares[1].to}`, time: '昨天', store: storeOf(BASE.shares[1].from) },
        ...BASE.checkins.slice(1, 8).map(c => ({ kind: 'in', text: `${c.name} 入场，${c.method}`, time: c.time, store: c.store })),
      ].filter(x => inStore(x, sto));
      const feed = (hasDemo(sto) ? S.feed.slice(0, 6).map(x => ({ ...x, demo: true, store: DEMO_STORE })) : []).concat(baseFeed).slice(0, 7);
      const FEED_IC = { in: 'door', order: 'yuan', share: 'gift', claim: 'check', book: 'calendar', admin: 'edit' };
      const where = all ? '三家店合计' : storeName(sto);

      const compare = all ? (() => {
        const rows = STORES.map(s => {
          const rs = RouteSets.branchStatus(s.id), n = newcomers(s.id);
          return { s, rev: mtdTotal(s.id), entries: todayEntries(s.id), members: activeMembers(s.id), nv: n.reduce((a, x) => a + x.visitors, 0), nb: n.reduce((a, x) => a + x.bought, 0), rs };
        });
        const maxRev = Math.max(...rows.map(r => r.rev));
        return `<div class="card flush"><div class="card-h pad"><div><h2>门店对比</h2><p class="sub">点门店名只看这家店</p></div></div>
          <div class="tbl-wrap"><table class="tbl cmp-tbl"><thead><tr><th>门店</th><th>本月营收</th><th class="num">今日入场</th><th class="num">有效会员</th><th class="num">本月新客</th><th class="num">其中办卡</th><th>当前这批线</th></tr></thead>
          <tbody>${rows.map(r => `<tr><td><button class="link-btn" data-x="dashStore" data-v="${r.s.id}">${r.s.name}</button></td>
            <td><span class="cmp-rev"><span class="cmp-bar"><i style="width:${r.rev / maxRev * 100}%"></i></span><b>${yuan(r.rev)}</b><small>${pct(r.rev, total)}%</small></span></td>
            <td class="num">${r.entries}</td><td class="num">${r.members}</td><td class="num">${r.nv}</td><td class="num">${r.nb}<small class="muted">（${pct(r.nb, r.nv)}%）</small></td>
            <td>${r.rs.days < 7 ? `<span class="chip">${icon('bolt', 12)}新线第 ${r.rs.days} 天</span>` : r.rs.cooled ? `<span class="chip warn">${icon('clock', 12)}热度已回落</span>` : `<span class="chip olive">热度 ${r.rs.heat}</span>`}</td></tr>`).join('')}</tbody></table></div></div>`;
      })() : '';

      return `
      <header class="page-h"><div><h1>数据看板</h1><p class="sub">${dateLine()}，${where}</p></div>
        <span class="live-pill"><i></i>和小程序原型实时联动</span></header>
      <div class="toolbar"><div class="chips-row">${[['all', '全部门店'], ...STORES.map(s => [s.id, s.name])].map(([k, l]) => `<button class="fchip ${sto === k ? 'on' : ''}" data-x="dashStore" data-v="${k}">${l}</button>`).join('')}</div></div>
      <div class="grid g-4">
        <div class="card kpi hero"><span class="label">本月营收</span><b class="value">${yuan(total)}</b>
          <div class="kpi-f">${delta(total, lastTotal)}<small>比上月同期</small>${Charts.spark(revSpark, { color: '#000' })}</div></div>
        <div class="card kpi"><span class="label">今日入场</span><b class="value">${todayEntries(sto)}<small>人次</small></b>
          <div class="kpi-f">${delta(todayEntries(sto), lastWeekSoFar(sto), '')}<small>比上${WEEK[TODAY.getDay()]}同一时段</small></div></div>
        <div class="card kpi"><span class="label">今日约课</span><b class="value">${tb.people + tb.pt}<small>人次</small></b>
          <div class="kpi-f"><small>团课 ${tb.classes} 节共 ${tb.people} 人，私教 ${tb.pt} 节</small></div></div>
        <div class="card kpi"><span class="label">有效会员</span><b class="value">${activeMembers(sto)}<small>人</small></b>
          <div class="kpi-f"><small>本月新增 ${ncBought} 人，其中老带新 ${nc.find(x => x.key === 'referral').bought} 人</small></div></div>
      </div>
      ${compare}
      <div class="grid g-2-1">
        <div class="card"><div class="card-h"><div><h2>近 30 天营收</h2><p class="sub">按品类堆叠，鼠标移上去看每天明细</p></div></div>
          <div class="legend">${SERIES.map(x => `<span><i style="background:${x.color}"></i>${x.name}</span>`).join('')}</div>
          <div id="ch-rev" class="chart-box"></div></div>
        <div class="card"><div class="card-h"><div><h2>本月营收构成</h2><p class="sub">${TODAY.getMonth() + 1}月1日至今</p></div></div>
          <ul class="hbars">${CAT_ORDER.map(c => `<li><span class="hb-l"><i style="background:${CAT_COLOR[c]}"></i>${CAT[c]}</span>
            <span class="hb-track"><span style="width:${pct(m[c], Math.max(...Object.values(m)))}%;background:${CAT_COLOR[c]}"></span></span>
            <span class="hb-v"><b>${yuan(m[c])}</b><small>${pct(m[c], total)}%</small></span></li>`).join('')}</ul>
          <p class="note">期限卡收入按售出金额统计。按天摊销后的确认收入见「财务」。</p></div>
      </div>
      <div class="grid g-3">
        <div class="card"><div class="card-h"><div><h2>新客从哪来</h2><p class="sub">${TODAY.getMonth() + 1}月第一次来馆的 ${ncTotal} 人，其中 ${ncBought} 人办了卡</p></div>
            <button class="btn sm ghost" data-x="ask" data-v="q1">${icon('chat', 14)}问一问</button></div>
          <ul class="nc-list">${nc.map(x => `<li><span class="nc-l">${x.name}</span>
            <span class="nc-track"><span class="nc-v" style="width:${pct(x.visitors, Math.max(...nc.map(y => y.visitors)))}%"><i style="width:${pct(x.bought, x.visitors)}%"></i></span></span>
            <span class="nc-n"><b>${x.visitors}</b><small>办卡 ${x.bought}，${pct(x.bought, x.visitors)}%</small></span></li>`).join('')}</ul>
          <p class="note nc-key"><i class="k1"></i>第一次来馆<i class="k2"></i>其中已办卡</p></div>
        <div class="card"><div class="card-h"><div><h2>老带新转化</h2><p class="sub">${TODAY.getMonth() + 1}月，期限卡会员发出的邀请</p></div></div>
          <ul class="funnel">${[['发出邀请', f.sent], ['朋友领取', f.claimed], ['到馆体验', f.visited], ['办卡', f.bought]].map(([l, v], i, arr) =>
            `<li><span class="fn-l">${l}</span><span class="fn-track"><span style="width:${pct(v, f.sent)}%"></span></span><span class="fn-v"><b>${v}</b>${i ? `<small>${pct(v, arr[i - 1][1])}%</small>` : '<small></small>'}</span></li>`).join('')}</ul>
          <p class="note">右侧百分比是相对上一步的转化率。</p></div>
        <div class="card"><div class="card-h"><div><h2>7 天内到期</h2><p class="sub">期限卡会员，可以发续费提醒</p></div><span class="chip warn">${icon('clock', 13)}${expiring.length} 人</span></div>
          <ul class="expiring">${expiring.map(x => `<li><span><b>${x.name}</b><small>${x.card}，${all ? `${storeName(x.store)}，` : ''}${daysLeft(x.expire) === 0 ? '今天' : daysLeft(x.expire) + ' 天后'}到期</small></span><button class="btn sm" data-x="remind" data-v="${x.name}">提醒续费</button></li>`).join('') || '<li class="muted">这家店 7 天内没有到期的期限卡</li>'}</ul></div>
      </div>
      <div class="grid g-3">
        <div class="card"><div class="card-h"><div><h2>今日分时段入场</h2><p class="sub">10:00–23:00，每小时</p></div></div><div id="ch-hours" class="chart-box"></div></div>
        <div class="card"><div class="card-h"><div><h2>今天的团课</h2><p class="sub">${todayClasses.length} 节</p></div><button class="btn sm" data-x="nav" data-v="courses">课表</button></div>
          <ul class="today-classes">${todayClasses.map(k => `<li><time>${k.start}</time><span><b>${esc(k.name)}</b><small>${esc(coach(k.coach).name)}，${all ? storeName(k.store) : k.level}</small></span>
            <span class="tc-fill"><span class="seats"><i style="width:${k.booked / k.cap * 100}%"></i></span><small>${k.booked}/${k.cap}</small></span></li>`).join('') || '<li class="muted">今天没有团课</li>'}</ul></div>
        <div class="card"><div class="card-h"><div><h2>实时动态</h2><p class="sub">${hasDemo(sto) ? '在小程序里操作，这里会出现新记录' : '这家店最近的记录'}</p></div></div>
          <ul class="feed">${feed.map(x => `<li class="${x.demo ? 'is-new' : ''}"><span class="fd-ic">${icon(FEED_IC[x.kind] || 'bolt', 16)}</span><span class="fd-t">${esc(x.text)}${all ? `<small>${storeName(x.store)}</small>` : ''}</span>${x.demo ? newChip : ''}<time>${x.time}</time></li>`).join('')}</ul></div>
      </div>`;
    },

    finance() {
      const m = mtdByCat(), total = mtdTotal(), refunds = BASE.refunds;
      const split = { m1: .3, m3: .25, y1: .45, c10: .52, c20: .38, s1: .1, pt1: .15, pt5: .45, pt10: .4, g10: .7, g20: .3 };
      const rows = S.products.map(p => {
        let amt = Math.round(BASE.mtd[p.cat] * (split[p.id] || 0));
        let cnt = Math.max(0, Math.round(amt / p.price)); amt = cnt * p.price;
        demoOrders().filter(o => o.product === p.name).forEach(o => { cnt += 1; amt += o.amount; });
        return { name: p.name, cat: p.cat, cnt, amt };
      });
      const single = [['团课单节', 'class'], ['私教单节', 'pt'], ['活动报名', 'event']].map(([name, cat]) => {
        const amt = m[cat] - rows.filter(r => r.cat === cat).reduce((s, r) => s + r.amt, 0);
        return { name, cat, cnt: Math.max(0, Math.round(amt / (cat === 'event' ? 120 : cat === 'pt' ? 410 : 128))), amt: Math.max(0, amt) };
      });
      const all = rows.concat(single).filter(r => r.amt > 0);
      const orders = demoOrders().concat(BASE.orders).slice(0, 12);
      return `
      <header class="page-h"><div><h1>财务</h1><p class="sub">${TODAY.getFullYear()}年${TODAY.getMonth() + 1}月，截至今天</p></div>
        <button class="btn" data-x="export">${icon('down', 16)}导出 Excel</button></header>
      <div class="grid g-4">
        <div class="card kpi hero"><span class="label">本月营收</span><b class="value">${yuan(total)}</b><div class="kpi-f"><small>已收款金额，含微信支付和前台 POS</small></div></div>
        <div class="card kpi"><span class="label">退款</span><b class="value">${yuan(refunds)}</b><div class="kpi-f"><small>2 笔，均为次卡未使用部分</small></div></div>
        <div class="card kpi"><span class="label">净收入</span><b class="value">${yuan(total - refunds)}</b><div class="kpi-f"><small>营收减去退款</small></div></div>
        <div class="card kpi"><span class="label">预收余额</span><b class="value">${yuan(BASE.deferred + demoOrders().filter(o => o.cat !== 'event').reduce((s, o) => s + o.amount, 0))}</b><div class="kpi-f"><small>已收款但还没消耗的次卡、课时和期限卡剩余天数</small></div></div>
      </div>
      <div class="card"><div class="card-h"><div><h2>近 12 个月营收</h2><p class="sub">本月为截至今天的数据</p></div></div><div id="ch-months" class="chart-box"></div></div>
      <div class="grid g-2-1">
        <div class="card"><div class="card-h"><div><h2>按产品统计</h2><p class="sub">本月销量和销售额</p></div></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>产品</th><th>品类</th><th class="num">销量</th><th class="num">销售额</th><th class="num">占比</th></tr></thead>
          <tbody>${all.sort((a, b) => b.amt - a.amt).map(r => `<tr><td>${esc(r.name)}</td><td><span class="cat-dot" style="--c:${CAT_COLOR[r.cat]}"></span>${CAT[r.cat]}</td><td class="num">${r.cnt}</td><td class="num">${yuan(r.amt)}</td><td class="num">${pct(r.amt, total)}%</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card"><div class="card-h"><div><h2>收款方式</h2></div></div>
          <ul class="hbars">${[['微信支付', .91], ['前台 POS', .09]].map(([l, r]) => `<li><span class="hb-l">${l}</span><span class="hb-track"><span style="width:${r * 100}%;background:var(--s1)"></span></span><span class="hb-v"><b>${yuan(total * r)}</b><small>${Math.round(r * 100)}%</small></span></li>`).join('')}</ul>
          <div class="card-h mt"><div><h2>品类环比</h2><p class="sub">和上月同期相比</p></div></div>
          <ul class="mom">${CAT_ORDER.map(c => `<li><span><i class="cat-dot" style="--c:${CAT_COLOR[c]}"></i>${CAT[c]}</span>${delta(m[c], BASE.lastMtd[c])}</li>`).join('')}</ul></div>
      </div>
      <div class="card"><div class="card-h"><div><h2>最近订单</h2></div></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>订单号</th><th>时间</th><th>会员</th><th>产品</th><th class="num">金额</th><th>支付方式</th><th>状态</th></tr></thead>
        <tbody>${orders.map(o => `<tr class="${o.demo ? 'is-new' : ''}"><td class="mono">${o.id}</td><td>${o.when}</td><td>${esc(o.name)} ${o.demo ? newChip : ''}</td><td>${esc(o.product)}</td><td class="num">${yuan(o.amount)}</td><td>${o.pay}</td>
          <td>${o.status === '已退款' ? `<span class="chip gray">${o.status}</span>` : `<span class="chip olive">${o.status}</span>`}</td></tr>`).join('')}</tbody></table></div></div>`;
    },

    routes() {
      const R = RouteSets, N = st.rsWin;
      const list = R.all().filter(s => st.rsBranch === 'all' || s.branch === st.rsBranch);
      const rows = list.map(s => ({ s, a: R.analyze(s, N) }));
      if (st.rsSort === 'net') rows.sort((x, y) => (y.a.net ?? -9) - (x.a.net ?? -9));
      const sel = selectedSet(list);
      st.rsShown = sel?.id;
      const brName = b => `<span class="br-name"><i style="background:${b.color}"></i>${b.name}</span>`;

      const tiles = R.BRANCHES.map(b => {
        const t = R.branchStatus(b.id);
        const chip = t.days < 7 ? `<span class="chip">${icon('bolt', 12)}新线第 ${t.days} 天</span>`
          : t.cooled ? `<span class="chip warn">${icon('clock', 12)}热度已回落</span>` : `<span class="chip olive">热度还在</span>`;
        return `<div class="card br-tile ${st.rsBranch === b.id ? 'on' : ''}">
          <div class="br-h">${brName(b)}${chip}</div>
          <p class="sub">当前这批：${fmtMD(parseKey(t.cur.date))}换线，${esc(t.cur.area)}，已上线 ${t.days} 天</p>
          <div class="br-heat"><div><b>${t.heat ?? '—'}</b><small>最近几天的热度（换线前 = 100）</small></div>${t.spark.length > 1 ? Charts.spark(t.spark, { w: 120, h: 36, color: b.color }) : ''}</div>
          <dl class="br-dl"><div><dt>以往平均净提升</dt><dd>${signPct(t.avgNet)}</dd></div><div><dt>热度平均持续</dt><dd>${t.avgHeat} 天</dd></div></dl>
          ${t.pending ? `<p class="br-tip">${icon('calendar', 14)}已登记下一批：${fmtMD(parseKey(t.pending.date))}，${esc(t.pending.area)}</p>`
            : t.cooled ? `<p class="br-tip">${icon('info', 14)}这批线的热度已经回到换线前的水平，可以安排下一批了。</p>` : ''}
        </div>`;
      }).join('');

      let focus = '';
      if (sel) {
        const a = R.analyze(sel, N), b = R.branch(sel.branch), hol = R.overlapsHoliday(sel, N);
        const max = Math.max(...(sel.grades || [1]));
        focus = `<div class="grid g-2-1" id="rs-focus">
          <div class="card"><div class="card-h"><div><h2>热度曲线</h2><p class="sub">${b.name} ${fmtMD(parseKey(sel.date))}这一批，和${b.name}以往的批次对比</p></div></div>
            <div class="legend"><span><i style="background:${b.color}"></i>这一批</span><span><i class="gray"></i>${b.name}以往批次</span><span><i class="shade"></i>统计窗口：换线后 ${N} 天</span></div>
            <div id="ch-curve" class="chart-box"></div>
            <p class="axis-cap">横轴是换线前后的天数，纵轴以换线前 14 天的客流为 100，已扣除同期其他分馆的变化。</p></div>
          <div class="card rs-detail">
            <h2>${b.name}，${fmtMD(parseKey(sel.date))}换线</h2>
            <p class="sub">${esc(sel.area)}，主题「${esc(sel.theme)}」，${sel.routes} 条线，定线员 ${sel.setters.map(esc).join('、')}</p>
            ${sel.grades ? `<div class="grades" role="img" aria-label="难度分布">${sel.grades.map((c, i) => `<div class="gcol"><span>${c || ''}</span><i style="height:${c / max * 100}%"></i><em>${R.GRADES[i]}</em></div>`).join('')}</div>` : ''}
            ${a.status === 'early' ? `<p class="insight">新线刚上 ${a.days} 天，数据还不够，过几天再看。</p>` : `
            <ul class="rs-metrics">
              <li><span>换线前日均</span><b>${a.beforePerDay} 人</b></li>
              <li><span>换线后 ${Math.min(a.days, N)} 天日均</span><b>${a.afterPerDay} 人</b></li>
              <li><span>提升</span><b>${signPct(a.uplift)}</b></li>
              <li><span>同期其他分馆</span><b>${signPct(a.market)}</b></li>
              <li class="hl"><span>净提升</span><b>${signPct(a.net)}</b></li>
              <li><span>热度持续</span><b>${a.heatDays ? `${a.heatDays} 天` : `还没退，已 ${a.heatSpan} 天`}</b></li>
              <li><span>回访率</span><b>${Math.round(a.returnRate * 100)}%</b></li>
              <li><span>从其他分馆过来</span><b>${a.cross} 人次</b></li>
            </ul>
            <p class="insight">${insightFor(sel, a, hol)}</p>
            <p class="note">回访率是这段时间里来了 2 次及以上的会员占比，反映这批线值不值得反复来爬。</p>`}
          </div></div>`;
      }

      const tableRows = rows.map(({ s, a }) => {
        const b = R.branch(s.branch);
        const head = `<td>${brName(b)}</td><td class="nowrap">${fmtMD(parseKey(s.date))}${R.overlapsHoliday(s, N) ? `<span class="tag-hol">含${R.holidayName}</span>` : ''}${a.status === 'partial' ? `<small>已上线 ${-daysLeft(s.date)} 天</small>` : ''}</td>
          <td>${esc(s.area)}<small>${esc(s.theme)}</small></td><td>${s.setters.map(esc).join('、')}</td><td class="num">${s.routes}</td>`;
        if (a.status === 'pending') return `<tr class="${s.fresh ? 'is-new' : ''}">${head}<td colspan="7" class="muted">已登记，换线后第二天开始统计</td></tr>`;
        if (a.status === 'early') return `<tr>${head}<td colspan="7" class="muted">新线刚上 ${a.days} 天，数据还不够</td></tr>`;
        const w = Math.min(50, Math.abs(a.net) / 0.3 * 50);
        return `<tr class="rs-row ${sel?.id === s.id ? 'sel' : ''}" data-x="rsSel" data-v="${s.id}" tabindex="0" aria-selected="${sel?.id === s.id}">${head}
          <td class="num">${a.beforePerDay}</td><td class="num">${a.afterPerDay}</td><td class="num">${signPct(a.uplift)}</td><td class="num">${signPct(a.market)}</td>
          <td><span class="netbar"><span class="nb-track"><i class="${a.net >= 0 ? 'pos' : 'neg'}" style="width:${w}%"></i></span><b>${signPct(a.net)}</b></span></td>
          <td class="num">${a.heatDays ? `${a.heatDays} 天` : '还没退'}</td><td class="num">${Math.round(a.returnRate * 100)}%</td></tr>`;
      }).join('');

      return `<header class="page-h"><div><h1>定线分析</h1><p class="sub">每批新线换上之后，各分馆的客流变化了多少</p></div>
        <div class="row-btns"><button class="btn ghost" data-x="ask" data-v="q2">${icon('chat', 16)}问一问：哪批线会员来得最勤</button>
        <button class="btn primary" data-x="openDrawer" data-v="routeset">${icon('plus', 16)}登记换线</button></div></header>
        <div class="toolbar"><div class="chips-row">${[['all', '全部分馆'], ...R.BRANCHES.map(b => [b.id, b.name])].map(([k, l]) => `<button class="fchip ${st.rsBranch === k ? 'on' : ''}" data-x="rsBranch" data-v="${k}">${l}</button>`).join('')}</div>
          <div class="seg-sm" role="group" aria-label="统计窗口"><span>换线后</span>${[7, 14, 28].map(n => `<button class="${N === n ? 'on' : ''}" aria-pressed="${N === n}" data-x="rsWin" data-v="${n}">${n} 天</button>`).join('')}</div></div>
        <details class="method"><summary>这些数字是怎么算的</summary><ul>
          <li><b>换线前</b>：换线日前 14 天的日均入场。</li>
          <li><b>换线后</b>：换线日后 ${N} 天的日均入场（上面可以换成 7、14 或 28 天），碰到这个分馆的下一次换线就截止。</li>
          <li><b>同期其他分馆</b>：另外两个分馆在同样日期里的变化，代表节假日、天气、季节这些对所有分馆都有的影响。</li>
          <li><b>净提升 = 提升 − 同期其他分馆</b>。比较不同批次、不同分馆时，看这个数。</li>
          <li><b>热度持续</b>：扣除同期其他分馆的变化后，客流回落到换线前 5% 以内用了几天。</li>
          <li>周末本来人就多，所有数字都已经按星期几校正过。</li></ul></details>
        <div class="grid g-tiles">${tiles}</div>
        ${focus}
        <div class="card flush"><div class="card-h pad"><div><h2>各批次表现</h2><p class="sub">点一行，上面的热度曲线就换成这一批</p></div>
          <div class="seg-sm" role="group" aria-label="排序">${[['date', '按时间'], ['net', '按净提升']].map(([k, l]) => `<button class="${st.rsSort === k ? 'on' : ''}" aria-pressed="${st.rsSort === k}" data-x="rsSort" data-v="${k}">${l}</button>`).join('')}</div></div>
          <div class="tbl-wrap"><table class="tbl rs-tbl"><thead><tr><th>分馆</th><th>换线日期</th><th>区域和主题</th><th>定线员</th><th class="num">线路</th><th class="num">换线前日均</th><th class="num">换线后日均</th><th class="num">提升</th><th class="num">同期其他分馆</th><th>净提升</th><th class="num">热度持续</th><th class="num">回访率</th></tr></thead>
          <tbody>${tableRows}</tbody></table></div>
          <p class="note pad">原型里的客流是模拟数据。正式版直接用会员扫码入场记录（每条记录带分馆）和这里登记的换线批次自动计算。</p></div>`;
    },

    members() {
      return `
      <header class="page-h"><div><h1>会员</h1><p class="sub">有效会员 ${activeMembers()} 人：期限卡 ${BASE.activeMembers.period} 人，次卡 ${BASE.activeMembers.count + demoNewMembers()} 人</p></div></header>
      <div class="toolbar"><div class="chips-row">${[['all', '全部'], ['period', '期限卡'], ['count', '次卡'], ['expiring', '7 天内到期'], ['sleep', '30 天没来']].map(([k, l]) =>
        `<button class="fchip ${st.memFilter === k ? 'on' : ''}" data-x="memFilter" data-v="${k}">${l}</button>`).join('')}</div>
        <label class="search">${icon('search', 16)}<input id="mem-q" type="search" placeholder="搜索姓名" value="${esc(st.memQuery)}" aria-label="搜索会员姓名"></label></div>
      <div class="card flush"><div class="tbl-wrap" id="mem-table">${memberTable()}</div></div>`;
    },

    courses() {
      const tabs = `<div class="tabs">${[['class', '团课'], ['pt', '私教']].map(([k, l]) => `<button class="${st.courseTab === k ? 'on' : ''}" data-x="courseTab" data-v="${k}">${l}</button>`).join('')}</div>`;
      let body;
      if (st.courseTab === 'class') {
        body = `<div class="week">${[0, 1, 2, 3, 4, 5, 6].map(i => {
          const d = addDays(TODAY, i), key = dkey(d), list = S.classes.filter(k => k.date === key);
          return `<div class="wk-col"><div class="wk-h ${i === 0 ? 'today' : ''}"><b>${i === 0 ? '今天' : WEEK[d.getDay()]}</b><small>${d.getMonth() + 1}/${d.getDate()}</small></div>
            ${list.map(k => `<div class="wk-item lv-bg-${k.level} ${k.fresh ? 'is-new' : ''}"><time>${k.start}–${k.end}</time><b>${esc(k.name)}</b><small>${storeName(k.store)}，${esc(coach(k.coach).name)}，${k.level}</small>
              <span class="seats"><i style="width:${k.booked / k.cap * 100}%"></i></span><small>${k.booked}/${k.cap} 人${k.members.length ? `，含 ${k.members.map(userName).join('、')}` : ''}</small></div>`).join('') || '<p class="wk-empty">没有课</p>'}</div>`;
        }).join('')}</div>`;
      } else {
        body = `<div class="grid g-4">${COACHES.map((c, i) => {
          const keys = Object.keys(S.ptTaken).filter(k => k.startsWith(c.id + '|'));
          const demo = keys.filter(k => typeof S.ptTaken[k] === 'string');
          const todayN = keys.filter(k => k.split('|')[1] === todayKey()).length;
          return `<div class="card coach-card">${holdAvatar(c.ab, c.tone, 52, i)}<h3>${esc(c.name)}</h3><p class="sub">${c.tags.join('、')}，${yuan(c.price)}/节</p>
            <dl><div><dt>今天</dt><dd>${todayN} 节</dd></div><div><dt>未来 7 天</dt><dd>${keys.length} 节</dd></div><div><dt>空闲时段</dt><dd>${PT_HOURS.length * 7 - keys.length}</dd></div></dl>
            ${demo.length ? `<ul class="pt-demo">${demo.map(k => { const [, d, h] = k.split('|'); return `<li class="is-new">${newChip}${userName(S.ptTaken[k])}，${fmtMD(parseKey(d))} ${pad(+h)}:00</li>`; }).join('')}</ul>` : ''}</div>`;
        }).join('')}</div>`;
      }
      return `<header class="page-h"><div><h1>课程排期</h1><p class="sub">未来 7 天，团课 ${S.classes.length} 节</p></div>
        <button class="btn primary" data-x="openDrawer" data-v="class">${icon('plus', 16)}发布团课</button></header>${tabs}${body}`;
    },

    events() {
      const list = [...S.events].sort((a, b) => a.date.localeCompare(b.date));
      return `<header class="page-h"><div><h1>活动</h1><p class="sub">${list.length} 个活动在报名中</p></div>
        <button class="btn primary" data-x="openDrawer" data-v="event">${icon('plus', 16)}发布活动</button></header>
        <div class="ev-list">${list.map(e => {
          const d = parseKey(e.date);
          return `<div class="card ev-row ${e.fresh ? 'is-new' : ''}"><span class="ev-sw tone-${e.tone}"><b>${d.getDate()}</b><small>${d.getMonth() + 1}月</small></span>
            <div class="ev-main"><h3>${esc(e.title)} ${e.fresh ? newChip : ''}</h3><p class="sub">${WEEK[d.getDay()]} ${e.start}–${e.end}，${esc(e.area)}</p></div>
            <div class="ev-fee"><b>${e.fee ? yuan(e.fee) : '免费'}</b><small>${e.fee ? `已收 ${yuan(e.fee * e.joined)}` : '免费活动'}</small></div>
            <div class="ev-sign"><span class="seats"><i style="width:${e.joined / e.cap * 100}%"></i></span><small>已报名 ${e.joined}/${e.cap}${e.members.length ? `，含 ${e.members.map(userName).join('、')}` : ''}</small></div>
            <span class="chip ${e.joined >= e.cap ? 'gray' : 'olive'}">${e.joined >= e.cap ? '已满' : '报名中'}</span></div>`;
        }).join('')}</div>`;
    },

    entries() {
      const tabs = `<div class="tabs">${[['in', '今日入场'], ['share', '分享与老带新']].map(([k, l]) => `<button class="${st.entryTab === k ? 'on' : ''}" data-x="entryTab" data-v="${k}">${l}</button>`).join('')}</div>`;
      if (st.entryTab === 'in') {
        const rows = S.checkins.concat(BASE.checkins);
        const total = todayEntries(), demo = S.checkins;
        const by = k => demo.filter(x => x.method.includes(k)).length;
        return `<header class="page-h"><div><h1>入场与分享</h1><p class="sub">${dateLine()}</p></div></header>${tabs}
          <div class="grid g-4 compact">
            <div class="card kpi"><span class="label">今日入场</span><b class="value">${total}<small>人次</small></b></div>
            <div class="card kpi"><span class="label">期限卡</span><b class="value">${Math.round((total - demo.length) * .58) + by('卡') - by('次卡')}<small>人次</small></b></div>
            <div class="card kpi"><span class="label">次卡和单次票</span><b class="value">${Math.round((total - demo.length) * .33) + by('次卡') + by('单次票') - by('好友')}<small>人次</small></b></div>
            <div class="card kpi"><span class="label">好友赠送和老带新</span><b class="value">${Math.round((total - demo.length) * .09) + by('好友') + by('老带新')}<small>人次</small></b></div></div>
          <div class="card flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>时间</th><th>会员</th><th>入场方式</th><th>门店</th></tr></thead>
          <tbody>${rows.map(r => `<tr class="${r.demo ? 'is-new' : ''}"><td class="mono">${r.time}</td><td>${esc(r.name)} ${r.demo ? newChip : ''}</td><td>${esc(r.method)}</td><td>${storeName(r.store)}</td></tr>`).join('')}</tbody></table></div>
          <p class="note pad">只显示最近 ${rows.length} 条，原型数据。</p></div>`;
      }
      const stName = { pending: '等待领取', claimed: '已领取', used: '已入场' };
      const rows = S.shares.map(s => ({ time: `今天 ${s.time}`, from: userName(s.from), kind: s.kind, what: s.kind === 'count' ? `${s.cardName} × ${s.qty} 次` : '老带新', to: s.to ? userName(s.to) : s.toName, status: s.status, demo: true })).concat(BASE.shares);
      const f = funnel();
      const giftN = 27 + S.shares.filter(s => s.kind === 'count').reduce((a, s) => a + s.qty, 0);
      return `<header class="page-h"><div><h1>入场与分享</h1><p class="sub">${TODAY.getMonth() + 1}月</p></div></header>${tabs}
        <div class="grid g-4 compact">
          <div class="card kpi"><span class="label">次卡转赠</span><b class="value">${giftN}<small>次</small></b></div>
          <div class="card kpi"><span class="label">老带新邀请</span><b class="value">${f.sent}<small>个</small></b></div>
          <div class="card kpi"><span class="label">邀请领取率</span><b class="value">${pct(f.claimed, f.sent)}<small>%</small></b></div>
          <div class="card kpi"><span class="label">体验后办卡</span><b class="value">${pct(f.bought, f.visited)}<small>%</small></b></div></div>
        <div class="card flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>时间</th><th>分享人</th><th>类型</th><th>内容</th><th>领取人</th><th>状态</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="${r.demo ? 'is-new' : ''}"><td>${r.time}</td><td>${esc(r.from)} ${r.demo ? newChip : ''}</td><td>${r.kind === 'count' ? '次卡转赠' : '老带新'}</td><td>${esc(r.what)}</td><td>${esc(r.to)}</td>
          <td><span class="chip ${r.status === 'pending' ? '' : 'olive'}">${stName[r.status]}</span></td></tr>`).join('')}</tbody></table></div>
        <p class="note pad">老带新：邀请人当天扫码入场后，领取人当天扫码才能免费进。每位期限卡会员每月 1 次。</p></div>`;
    },

    products() {
      const draft = st.priceDraft;
      return `<header class="page-h"><div><h1>卡种与价格</h1><p class="sub">保存后，小程序「购卡」页面马上更新</p></div>
        <button class="btn primary" data-x="savePrices">${icon('check', 16)}保存修改</button></header>
        ${['period', 'count', 'pt', 'class'].map(cat => `<div class="card flush"><div class="card-h pad"><div><h2>${CAT[cat]}</h2></div></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>名称</th><th>内容</th><th class="num">售价（元）</th><th>在售</th></tr></thead>
          <tbody>${S.products.filter(p => p.cat === cat).map(p => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.desc)}</td>
            <td class="num"><input class="price-in" type="number" min="1" step="1" data-pid="${p.id}" value="${draft[p.id]?.price ?? p.price}" aria-label="${esc(p.name)}售价"></td>
            <td><label class="switch"><input type="checkbox" data-pid-on="${p.id}" ${(draft[p.id]?.on ?? p.on) ? 'checked' : ''}><span></span><em>${(draft[p.id]?.on ?? p.on) ? '在售' : '已下架'}</em></label></td></tr>`).join('')}</tbody></table></div></div>`).join('')}`;
    },
  };

  function memberTable() {
    const q = st.memQuery.trim();
    const demo = Object.values(S.users).filter(u => u.cards.length).map(u => {
      const pc = periodCard(u.id), cc = u.cards.find(c => ['count', 'gift'].includes(c.kind) && c.left > 0);
      const c = pc || cc || u.cards[0];
      return { name: u.name, phone: u.phone, card: c.kind === 'gift' ? '好友送的次卡' : c.kind === 'referral' ? '老带新体验券' : c.name, kind: pc ? 'period' : 'count', expire: c.end, left: c.left ?? null, month: u.visits.length, last: u.checkins.length ? todayKey() : dkey(addDays(TODAY, -(TODAY.getDate() - Math.max(0, ...u.visits.filter(d => d < TODAY.getDate()))))), source: u.id === 'jie' ? '自己来的' : u.cards.some(x => x.kind === 'referral') ? '老带新' : u.cards.some(x => x.kind === 'gift') ? '好友送次卡' : '自己来的', demo: true };
    });
    let rows = demo.concat(BASE.members);
    const f = st.memFilter;
    if (f === 'period' || f === 'count') rows = rows.filter(r => r.kind === f);
    if (f === 'expiring') rows = rows.filter(r => daysLeft(r.expire) >= 0 && daysLeft(r.expire) <= 7);
    if (f === 'sleep') rows = rows.filter(r => -daysLeft(r.last) > 30);
    if (q) rows = rows.filter(r => r.name.includes(q));
    if (!rows.length) return `<p class="empty-a">没有符合条件的会员。换个筛选条件，或者清空搜索。</p>`;
    return `<table class="tbl"><thead><tr><th>会员</th><th>卡种</th><th>到期 / 剩余</th><th class="num">本月到店</th><th>最近到店</th><th>来源</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => {
        const dl = daysLeft(r.expire), lastAgo = -daysLeft(r.last);
        const exp = dl < 0 ? '<span class="chip gray">已过期</span>' : dl <= 7 ? `<span class="chip warn">${icon('clock', 12)}${dl === 0 ? '今天到期' : `${dl} 天后到期`}</span>` : fmtDot(r.expire);
        return `<tr class="${r.demo ? 'is-new' : ''}"><td><span class="who">${holdAvatar(r.name.slice(-1), ['olive', 'chalk', 'volume', 'white'][i % 4], 28, i)}<span><b>${esc(r.name)}</b><small>${r.phone}</small></span></span></td>
          <td><span class="cat-dot" style="--c:${CAT_COLOR[r.kind]}"></span>${esc(r.card)}</td><td>${exp}${r.left != null ? `<small class="left">剩 ${r.left} 次</small>` : ''}</td>
          <td class="num">${r.month}</td><td>${lastAgo <= 0 ? '今天' : lastAgo === 1 ? '昨天' : `${lastAgo} 天前`}</td><td>${r.source}</td>
          <td>${dl >= 0 && dl <= 7 ? `<button class="btn sm" data-x="remind" data-v="${esc(r.name)}">提醒续费</button>` : lastAgo > 30 ? `<button class="btn sm ghost" data-x="winback" data-v="${esc(r.name)}">发回访券</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table><p class="note pad">共 ${rows.length} 条，原型只展示部分会员。</p>`;
  }

  // ---------- 发布表单 ----------
  const timeOpts = (sel) => { let s = ''; for (let h = 9; h <= 21; h++) for (const m of ['00', '30']) { const v = `${pad(h)}:${m}`; s += `<option ${v === sel ? 'selected' : ''}>${v}</option>`; } return s; };
  const DRAWERS = {
    class: () => `<div class="dr-h"><h2>发布团课</h2><button class="icon-btn" data-x="closeDrawer" aria-label="关闭">${icon('close', 20)}</button></div>
      <form id="f-class" class="form" novalidate>
        <label>课程名称<input name="name" required placeholder="比如：女生抱石专场" maxlength="16"></label>
        <label>门店<select name="store">${STORES.map(x => `<option value="${x.id}">${x.name}</option>`).join('')}</select></label>
        <div class="f-row"><label>难度<select name="level"><option>入门</option><option>进阶</option><option>全部</option></select></label>
          <label>教练<select name="coach">${COACHES.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></label></div>
        <div class="f-row"><label>日期<select name="day">${[0, 1, 2, 3, 4, 5, 6].map(i => { const d = addDays(TODAY, i); return `<option value="${i}" ${i === 1 ? 'selected' : ''}>${fmtMD(d)} ${WEEK[d.getDay()]}</option>`; }).join('')}</select></label>
          <label>开始时间<select name="start">${timeOpts('19:30')}</select></label></div>
        <div class="f-row"><label>时长<select name="dur"><option value="60">60 分钟</option><option value="90" selected>90 分钟</option><option value="120">120 分钟</option></select></label>
          <label>人数上限<input name="cap" type="number" min="1" max="30" value="8"></label></div>
        <p class="f-note">会员可以用团课次数预约，也可以单节付 ${yuan(CLASS_SINGLE_PRICE)}。</p>
        <p class="f-err" id="f-err" role="alert"></p>
        <div class="dr-f"><button type="button" class="btn" data-x="closeDrawer">取消</button><button type="submit" class="btn primary">发布到小程序</button></div></form>`,
    event: () => `<div class="dr-h"><h2>发布活动</h2><button class="icon-btn" data-x="closeDrawer" aria-label="关闭">${icon('close', 20)}</button></div>
      <form id="f-event" class="form" novalidate>
        <label>活动名称<input name="title" required placeholder="比如：万圣节变装夜爬" maxlength="16"></label>
        <div class="f-row"><label>日期<input name="date" type="date" min="${todayKey()}" value="${dkey(addDays(TODAY, 10))}"></label>
          <label>地点<input name="area" value="全馆" maxlength="16"></label></div>
        <div class="f-row"><label>开始<input name="start" type="time" value="19:00"></label><label>结束<input name="end" type="time" value="22:00"></label></div>
        <div class="f-row"><label>名额<input name="cap" type="number" min="1" value="40"></label><label>费用（元，0 为免费）<input name="fee" type="number" min="0" value="0"></label></div>
        <fieldset class="tones"><legend>封面颜色</legend>${EVENT_TONES.map((t, i) => `<label><input type="radio" name="tone" value="${t}" ${i === 0 ? 'checked' : ''}><span class="tone-${t}"></span></label>`).join('')}</fieldset>
        <label>活动介绍<textarea name="desc" rows="3" placeholder="写清楚适合谁、要带什么、费用包含什么"></textarea></label>
        <p class="f-err" id="f-err" role="alert"></p>
        <div class="dr-f"><button type="button" class="btn" data-x="closeDrawer">取消</button><button type="submit" class="btn primary">发布到小程序</button></div></form>`,
    routeset: () => {
      const bs = RouteSets.BRANCHES, b0 = st.rsBranch === 'all' ? bs[0] : RouteSets.branch(st.rsBranch);
      return `<div class="dr-h"><h2>登记换线</h2><button class="icon-btn" data-x="closeDrawer" aria-label="关闭">${icon('close', 20)}</button></div>
      <form id="f-routeset" class="form" novalidate>
        <div class="f-row"><label>分馆<select name="branch" id="rs-branch">${bs.map(b => `<option value="${b.id}" ${b === b0 ? 'selected' : ''}>${b.name}</option>`).join('')}</select></label>
          <label>换线日期<input name="date" type="date" min="${todayKey()}" max="${dkey(addDays(TODAY, 60))}" value="${dkey(addDays(TODAY, 3))}"></label></div>
        <div class="f-row"><label>区域<select name="area" id="rs-area">${b0.walls.map(w => `<option>${esc(w)}</option>`).join('')}</select></label>
          <label>线路数<input name="routes" type="number" min="1" max="60" value="14"></label></div>
        <label>主题<input name="theme" placeholder="比如：脚法与平衡" maxlength="12"></label>
        <label>定线员<input name="setters" placeholder="多人用顿号隔开，比如：阿凯、小葵" maxlength="30"></label>
        <label class="check"><input type="checkbox" name="notify" checked><span>在小程序首页「馆内动态」发布新线预告</span></label>
        <p class="f-note">换线后，系统会自动统计这批线带来的客流，和以往批次放在一起比较。</p>
        <p class="f-err" id="f-err" role="alert"></p>
        <div class="dr-f"><button type="button" class="btn" data-x="closeDrawer">取消</button><button type="submit" class="btn primary">登记</button></div></form>`;
    },
  };

  function submitRouteSet(form) {
    const f = Object.fromEntries(new FormData(form)), err = m => (form.querySelector('#f-err').textContent = m);
    if (!f.date || f.date < todayKey()) return err('换线日期要选今天或以后');
    const routes = Math.round(+f.routes);
    if (!(routes >= 1)) return err('请填写线路数');
    const setters = f.setters.split(/[、,，\s]+/).filter(Boolean);
    const b = RouteSets.branch(f.branch);
    RouteSets.register({ branch: f.branch, date: f.date, area: f.area, theme: f.theme.trim(), setters: setters.length ? setters : ['未填写'], routes });
    if (f.notify) S.routeNews = { branch: b.name, date: f.date, area: f.area, routes, theme: f.theme.trim() };
    pushFeed('admin', `登记了${b.name}${fmtMD(parseKey(f.date))}的换线：${f.area}，${routes} 条线`);
    st.drawer = null;
    Mini.renderAll(); Main.onData();
    toast(f.notify ? '已登记。小程序首页的「馆内动态」已经发布了新线预告' : '已登记，换线后开始统计');
  }

  function submitClass(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!f.name.trim()) return form.querySelector('#f-err').textContent = '请填写课程名称';
    const [h, mi] = f.start.split(':').map(Number), endMin = h * 60 + mi + +f.dur;
    const k = { id: newId('k'), date: dkey(addDays(TODAY, +f.day)), name: f.name.trim(), store: f.store, level: f.level, coach: f.coach, start: f.start, end: `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`, cap: Math.max(1, +f.cap || 8), booked: 0, members: [], fresh: true };
    S.classes.push(k); S.classes.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    pushFeed('admin', `后台发布了团课「${k.name}」，${fmtMD(parseKey(k.date))} ${k.start}`);
    st.drawer = null; st.courseTab = 'class';
    Mini.renderAll(); Main.onData();
    toast(`已发布到${storeName(k.store)}。小程序「约课 → 团课」里选 ${fmtMD(parseKey(k.date))} 就能看到`);
  }
  function submitEvent(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!f.title.trim()) return form.querySelector('#f-err').textContent = '请填写活动名称';
    if (!f.date || f.date < todayKey()) return form.querySelector('#f-err').textContent = '请选择今天或以后的日期';
    if (f.end <= f.start) return form.querySelector('#f-err').textContent = '结束时间要晚于开始时间';
    const e = { id: newId('e'), title: f.title.trim(), date: f.date, start: f.start, end: f.end, fee: Math.max(0, +f.fee || 0), cap: Math.max(1, +f.cap || 40), joined: 0, tone: f.tone, area: f.area || '全馆', desc: f.desc.trim() || '活动详情稍后更新。', members: [], fresh: true };
    S.events.push(e);
    pushFeed('admin', `后台发布了活动「${e.title}」`);
    st.drawer = null;
    Mini.renderAll(); Main.onData();
    toast('已发布。小程序「约课 → 活动」里能看到了');
  }

  // ---------- 事件 ----------
  const ACT = {
    nav: v => { page = v; st.drawer = null; render(); scrollTo(0, 0); },
    memFilter: v => { st.memFilter = v; render(); },
    courseTab: v => { st.courseTab = v; render(); },
    entryTab: v => { st.entryTab = v; render(); },
    dashStore: v => { st.dashStore = v; render(); },
    ask: v => Ask.preset(v),
    rsBranch: v => { st.rsBranch = v; render(); },
    rsWin: v => { st.rsWin = +v; render(); },
    rsSort: v => { st.rsSort = v; render(); },
    rsSel: v => {
      st.rsSel = v; render();
      document.querySelector(`tr[data-v="${v}"]`)?.focus({ preventScroll: true });
      document.getElementById('rs-focus')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    openDrawer: v => { st.drawer = v; render(); document.querySelector('.drawer input')?.focus(); },
    closeDrawer: () => { st.drawer = null; render(); },
    remind: v => toast(`已给 ${v} 发送续费提醒（小程序服务通知）`),
    winback: v => toast(`已给 ${v} 发送一张回访体验券`),
    export: () => toast('原型里不生成文件，正式版会导出本月报表'),
    savePrices: () => {
      const n = Object.keys(st.priceDraft).length;
      Object.entries(st.priceDraft).forEach(([id, d]) => { const p = product(id); if (d.price != null && d.price > 0) p.price = d.price; if (d.on != null) p.on = d.on; });
      st.priceDraft = {};
      Mini.renderAll();
      toast(n ? `已保存 ${n} 项修改，小程序购卡页已更新` : '没有需要保存的修改');
    },
  };
  function bind(root) {
    root.addEventListener('click', e => {
      const el = e.target.closest('[data-x]');
      if (!el) return;
      if (el.dataset.x === 'closeDrawer' && el.classList.contains('drawer-mask') && e.target !== el) return;
      ACT[el.dataset.x]?.(el.dataset.v);
    });
    root.addEventListener('submit', e => {
      e.preventDefault();
      if (e.target.id === 'f-class') submitClass(e.target);
      if (e.target.id === 'f-event') submitEvent(e.target);
      if (e.target.id === 'f-routeset') submitRouteSet(e.target);
    });
    root.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-x]')) { e.preventDefault(); ACT[e.target.dataset.x](e.target.dataset.v); }
    });
    root.addEventListener('input', e => {
      if (e.target.id === 'mem-q') { st.memQuery = e.target.value; document.getElementById('mem-table').innerHTML = memberTable(); }
      if (e.target.dataset.pid) (st.priceDraft[e.target.dataset.pid] ||= {}).price = Math.round(+e.target.value);
    });
    root.addEventListener('change', e => {
      if (e.target.id === 'rs-branch') document.getElementById('rs-area').innerHTML = RouteSets.branch(e.target.value).walls.map(w => `<option>${esc(w)}</option>`).join('');
      if (e.target.dataset.pidOn) { (st.priceDraft[e.target.dataset.pidOn] ||= {}).on = e.target.checked; e.target.parentElement.querySelector('em').textContent = e.target.checked ? '在售' : '已下架'; }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.drawer) { st.drawer = null; render(); } });
  }

  return { render, bind, drawCharts, go: (v, patch) => { Object.assign(st, patch || {}); ACT.nav(v); }, metrics: { mtdTotal, funnel, newcomers, activeMembers }, reset: () => { page = 'dash'; Object.assign(st, ST0, { priceDraft: {} }); } };
})();
