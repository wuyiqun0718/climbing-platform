/* 「问数据」演示：在后台用中文问门店的经营数据
 *
 * 原型里没有接大模型：先用关键词判断问题属于哪一类，再用和看板同一套数据把答案算出来。
 * 页面上的「查询过程」展示的是正式版里大模型会调用的工具（find_entities / query_metric），
 * 正式版里大模型只负责理解问题、选工具和参数，数字全部由指标层计算。
 */

const Ask = (() => {
  const st = { open: false, busy: false, msgs: [], newcomerDef: null };
  const PRESETS = {
    q1: '上个月哪个活动的新客占比最高？',
    q2: '过去六个月哪一批定线的探馆频率最高？',
    q3: '上个月哪家店的营收最高？',
    q4: '这个月老带新带来了多少新客？',
    q5: '有多少期限卡会员超过 30 天没来了？',
  };
  const DEFS = { first: '第一次来馆的人', nocard: '报名时还没办卡的人' };
  const ym = d => `${d.getFullYear()}年${d.getMonth() + 1}月`;
  const lastMonth = () => new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1);
  const pctOf = (a, b) => (b ? Math.round(a / b * 100) : 0);
  const signed = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`;
  const storeArg = s => (s ? `, 门店="${s.name}"` : '');

  function intentOf(q) {
    if (/老带新|邀请|带朋友/.test(q)) return 'q4';
    if (/活动/.test(q) && /新客|新人|新会员|第一次|新面孔/.test(q)) return 'q1';
    if (/定线|线路|新线|换线|批/.test(q) && /频率|探馆|次数|回访|常来|来得|人气|受欢迎|吸引/.test(q)) return 'q2';
    if (/营收|收入|流水|销售|业绩|赚/.test(q)) return 'q3';
    if (/没来|不来|流失|沉睡|很久没|好久没/.test(q)) return 'q5';
    return null;
  }
  const storeIn = q => STORES.find(s => q.includes(s.name) || q.includes(s.name.replace(/店$/, '')));

  // ---------- 每一类问题怎么算 ----------
  const bar = (v, max) => `<span class="ab"><i style="width:${max ? v / max * 100 : 0}%"></i></span>`;

  const ANSWERS = {
    q1(q) {
      const store = storeIn(q), month = lastMonth(), key = st.newcomerDef;
      const groups = {};
      BASE.pastEvents.filter(e => !store || e.store === store.id).forEach(e => {
        const g = (groups[`${e.title}|${e.store}`] ||= { title: e.title, store: e.store, sessions: 0, signups: 0, newbies: 0 });
        g.sessions += 1; g.signups += e.signups; g.newbies += key === 'first' ? e.firstVisit : e.noCard;
      });
      const rows = Object.values(groups).map(g => ({ ...g, share: pctOf(g.newbies, g.signups) })).sort((a, b) => b.share - a.share);
      const top = rows[0], most = [...rows].sort((a, b) => b.newbies - a.newbies)[0];
      let lead = `${ym(month)}新客占比最高的是「${top.title}」，报名 ${top.signups} 人里有 ${top.newbies} 人是新客，占 ${top.share}%。`;
      if (top.title === '新人体验日' && rows[1]) lead += `不过它本来就是给新人办的；除了它，占比最高的是「${rows[1].title}」（${rows[1].share}%）。`;
      if (most !== top) lead += `如果看新客人数，最多的是「${most.title}」，带来了 ${most.newbies} 位新客。`;
      const max = Math.max(...rows.map(r => r.share));
      return {
        understood: `按活动统计${ym(month)}的新客占比${store ? `，只看${store.name}` : ''}`,
        trace: [
          { call: `find_entities(类型="活动", 时间="${ym(month)}"${storeArg(store)})`, result: `找到 ${BASE.pastEvents.filter(e => !store || e.store === store.id).length} 场活动，合并成 ${rows.length} 个` },
          { call: `query_metric(指标="新客占比", 口径="${DEFS[key]}", 分组="活动", 时间="${ym(month)}", 排序="从高到低")`, result: `返回 ${rows.length} 行` },
        ],
        lead,
        table: `<table class="at"><thead><tr><th>活动</th><th>门店</th><th class="num">报名</th><th class="num">新客</th><th>占比</th></tr></thead><tbody>
          ${rows.map(r => `<tr><td>${r.title}${r.sessions > 1 ? `<small>${r.sessions} 场</small>` : ''}</td><td>${storeName(r.store)}</td><td class="num">${r.signups}</td><td class="num">${r.newbies}</td><td>${bar(r.share, max)}<b>${r.share}%</b></td></tr>`).join('')}</tbody></table>`,
        def: `新客 = ${key === 'first' ? '活动当天之前从没来过馆的人' : '报名时还没有任何卡的人'}；时间：${ym(month)}；门店：${store ? store.name : '三家店'}`,
        actions: [['去活动页', 'events']],
        next: ['q4', 'q2'],
      };
    },

    q2(q) {
      const store = storeIn(q), since = dkey(addDays(TODAY, -183));
      const sets = RouteSets.all().filter(s => !s.pending && s.date >= since && (!store || s.branch === store.id));
      const done = [], skipped = [];
      sets.forEach(s => { const a = RouteSets.analyze(s, 14); (a.status === 'done' ? done : skipped).push({ s, a }); });
      done.forEach(x => (x.visitors = Math.round(x.a.afterPerDay * x.a.days / x.a.visitsPerMember)));
      done.sort((x, y) => y.a.visitsPerMember - x.a.visitsPerMember);
      if (!done.length) return { understood: '比较近 6 个月每批定线的人均到店次数', trace: [], lead: `${store ? store.name : '三家店'}近 6 个月还没有满 14 天的换线批次。`, table: '', def: '只统计已经满 14 天的批次', actions: [['去定线分析', 'routes']], next: ['q1'] };
      const avg = Math.round(done.reduce((a, x) => a + x.a.visitsPerMember, 0) / done.length * 10) / 10;
      const [t1, t2, t3] = done, name = x => `${storeName(x.s.branch)} ${fmtMD(parseKey(x.s.date))}「${x.s.area}，${x.s.theme}」`;
      let lead = `过去六个月，换线后会员来得最勤的是${name(t1)}那批：14 天里来过的会员，平均每人来了 ${t1.a.visitsPerMember.toFixed(1)} 次，比这半年的平均（${avg.toFixed(1)} 次）高 ${pctOf(t1.a.visitsPerMember - avg, avg)}%。`;
      if (t2) lead += `第二、三名是${name(t2)}（${t2.a.visitsPerMember.toFixed(1)} 次）${t3 ? `和${name(t3)}（${t3.a.visitsPerMember.toFixed(1)} 次）` : ''}。`;
      if (skipped.length) lead += `${skipped.map(x => `${storeName(x.s.branch)} ${fmtMD(parseKey(x.s.date))}`).join('、')}那批换线还不满 14 天，没有算进来。`;
      const max = done[0].a.visitsPerMember;
      return {
        understood: `比较近 6 个月每批定线换线后 14 天的人均到店次数${store ? `，只看${store.name}` : ''}`,
        trace: [
          { call: `find_entities(类型="换线批次", 时间="近 6 个月"${storeArg(store)})`, result: `找到 ${sets.length} 批，其中 ${skipped.length} 批不满 14 天` },
          { call: `query_metric(指标="人均到店次数", 分组="换线批次", 窗口="换线后 14 天", 排序="从高到低")`, result: `返回 ${done.length} 行` },
        ],
        lead,
        table: `<table class="at"><thead><tr><th>门店</th><th>换线</th><th>区域和主题</th><th>人均到店</th><th class="num">到店会员</th><th class="num">净提升</th></tr></thead><tbody>
          ${done.slice(0, 8).map(x => `<tr><td>${storeName(x.s.branch)}</td><td class="nowrap">${fmtMD(parseKey(x.s.date))}</td><td>${esc(x.s.area)}<small>${esc(x.s.theme)}</small></td><td>${bar(x.a.visitsPerMember, max)}<b>${x.a.visitsPerMember.toFixed(1)} 次</b></td><td class="num">${x.visitors}</td><td class="num">${signed(Math.round(x.a.net * 100))}</td></tr>`).join('')}</tbody></table>`,
        def: `探馆频率 = 换线后 14 天里，来过这家店的会员人均来了几次；只统计已经满 14 天的批次；门店：${store ? store.name : '三家店'}`,
        actions: [['去定线分析', 'routes']],
        next: ['q1', 'q5'],
      };
    },

    q3(q) {
      const store = storeIn(q), thisMonth = /这个月|本月/.test(q);
      let rows, period;
      if (thisMonth) {
        period = `${TODAY.getMonth() + 1}月1日至今`;
        rows = STORES.map(s => ({ s, v: Admin.metrics.mtdTotal(s.id), prev: null }));
      } else {
        const ms = BASE.months, last = ms[ms.length - 2], prev = ms[ms.length - 3];
        period = `${last.year}年${last.label}`;
        const a = splitStores(last.total, `month|${last.year}${last.label}`), b = splitStores(prev.total, `month|${prev.year}${prev.label}`);
        rows = STORES.map(s => ({ s, v: a[s.id], prev: b[s.id] }));
      }
      const total = rows.reduce((x, r) => x + r.v, 0);
      rows.sort((x, y) => y.v - x.v);
      const top = rows[0], mine = store && rows.find(r => r.s.id === store.id);
      const chg = r => (r.prev ? Math.round((r.v - r.prev) / r.prev * 100) : null);
      const lead = mine
        ? `${store.name}${period}的营收是 ${yuan(mine.v)}，占三家店的 ${pctOf(mine.v, total)}%，在三家店里排第 ${rows.indexOf(mine) + 1}${chg(mine) != null ? `，比上个月 ${signed(chg(mine))}` : ''}。`
        : `${period}营收最高的是${top.s.name}，${yuan(top.v)}，占三家店合计（${yuan(total)}）的 ${pctOf(top.v, total)}%。${chg(top) != null ? `比再上一个月 ${signed(chg(top))}。` : ''}`;
      const max = top.v;
      return {
        understood: `按门店统计${period}的营收`,
        trace: [{ call: `query_metric(指标="营收", 分组="门店", 时间="${period}")`, result: `返回 ${rows.length} 行` }],
        lead,
        table: `<table class="at"><thead><tr><th>门店</th><th>营收</th><th class="num">占比</th>${thisMonth ? '' : '<th class="num">比上月</th>'}</tr></thead><tbody>
          ${rows.map(r => `<tr><td>${r.s.name}</td><td>${bar(r.v, max)}<b>${yuan(r.v)}</b></td><td class="num">${pctOf(r.v, total)}%</td>${thisMonth ? '' : `<td class="num">${signed(chg(r))}</td>`}</tr>`).join('')}</tbody></table>`,
        def: `营收 = 已收款金额（含微信支付和前台 POS），未扣退款；时间：${period}`,
        actions: [['去财务页', 'finance']],
        next: ['q4', 'q5'],
      };
    },

    q4(q) {
      const store = storeIn(q), M = Admin.metrics;
      const scope = store ? [store] : STORES;
      const rows = scope.map(s => ({ s, f: M.funnel(s.id) }));
      const f = store ? rows[0].f : M.funnel('all'), nc = M.newcomers(store ? store.id : 'all');
      const rate = x => pctOf(x.bought, x.visitors), ranked = [...nc].sort((a, b) => rate(b) - rate(a));
      const ref = nc.find(x => x.key === 'referral'), pos = ranked.indexOf(ref) + 1;
      const lead = `${TODAY.getMonth() + 1}月${store ? store.name : '三家店'}老带新一共发出 ${f.sent} 个邀请，${f.claimed} 人领取，${f.visited} 人到馆体验，其中 ${f.bought} 人办了卡。`
        + `到馆的新客里有 ${rate(ref)}% 办了卡，${pos === 1 ? `在所有新客来源里办卡率最高（第二是「${ranked[1].name}」，${rate(ranked[1])}%）` : `在 ${nc.length} 个新客来源里排第 ${pos}（最高的是「${ranked[0].name}」，${rate(ranked[0])}%）`}。`;
      return {
        understood: `统计${TODAY.getMonth() + 1}月老带新的每一步人数，并和其他新客来源比较`,
        trace: [
          { call: `query_metric(指标="老带新漏斗", 分组="门店", 时间="${ym(TODAY)}"${storeArg(store)})`, result: `返回 ${rows.length} 行` },
          { call: `query_metric(指标="新客办卡率", 分组="来源", 时间="${ym(TODAY)}"${storeArg(store)})`, result: `返回 ${nc.length} 行` },
        ],
        lead,
        table: `<table class="at"><thead><tr><th>门店</th><th class="num">发出</th><th class="num">领取</th><th class="num">到馆</th><th class="num">办卡</th></tr></thead><tbody>
          ${rows.map(r => `<tr><td>${r.s.name}</td><td class="num">${r.f.sent}</td><td class="num">${r.f.claimed}</td><td class="num">${r.f.visited}</td><td class="num">${r.f.bought}</td></tr>`).join('')}
          ${store ? '' : `<tr class="sum"><td>合计</td><td class="num">${f.sent}</td><td class="num">${f.claimed}</td><td class="num">${f.visited}</td><td class="num">${f.bought}</td></tr>`}</tbody></table>`,
        def: `老带新：期限卡会员发出的邀请；到馆 = 领取人用体验券入了场；办卡 = 到馆后买了期限卡或次卡；时间：${ym(TODAY)}1日至今`,
        actions: [['去看分享记录', 'entries', { entryTab: 'share' }]],
        next: ['q1', 'q3'],
      };
    },

    q5(q) {
      const store = storeIn(q);
      const list = BASE.members.filter(m => m.kind === 'period' && daysLeft(m.expire) >= 0 && -daysLeft(m.last) > 30 && (!store || m.store === store.id));
      const by = STORES.map(s => ({ s, n: list.filter(m => m.store === s.id).length })).filter(x => !store || x.s.id === store.id);
      const lead = list.length
        ? `${store ? store.name : '三家店'}有 ${list.length} 位期限卡会员超过 30 天没来了，他们的卡都还没到期。${store ? '' : by.map(x => `${x.s.name} ${x.n} 位`).join('、') + '。'}可以给他们发一张回访券，提醒他们回来爬。`
        : `${store ? store.name : '三家店'}没有超过 30 天没来的期限卡会员。`;
      return {
        understood: `找出卡还没到期、但超过 30 天没来的期限卡会员${store ? `，只看${store.name}` : ''}`,
        trace: [{ call: `query_metric(指标="沉睡会员数", 卡种="期限卡", 条件="最近到店超过 30 天", 分组="门店"${storeArg(store)})`, result: `返回 ${by.length} 行` }],
        lead,
        table: list.length ? `<table class="at"><thead><tr><th>门店</th><th class="num">人数</th></tr></thead><tbody>${by.map(x => `<tr><td>${x.s.name}</td><td class="num">${x.n}</td></tr>`).join('')}</tbody></table>` : '',
        def: '沉睡会员 = 期限卡还在有效期内、最近一次到店超过 30 天的会员。回答里只给人数，名单去会员页看。',
        actions: [['去会员页看名单', 'members', { memFilter: 'sleep' }]],
        next: ['q4', 'q2'],
      };
    },
  };

  // ---------- 对话 ----------
  /** 返回 false 表示这次没有提问（空问题，或者上一个问题还在查） */
  function ask(q) {
    q = (q || '').trim();
    if (!q || st.busy) return false;
    open();
    st.msgs.push({ role: 'user', text: q });
    const intent = intentOf(q);
    if (intent === 'q1' && !st.newcomerDef) {
      st.msgs.push({ role: 'ai', kind: 'clarify', q });
      render(); return true;
    }
    if (!intent) {
      st.msgs.push({ role: 'ai', kind: 'unknown' });
      render(); return true;
    }
    answer(q, intent);
    return true;
  }

  function answer(q, intent) {
    const res = ANSWERS[intent](q);
    const plan = [{ call: '理解问题', result: res.understood }, ...res.trace];
    const msg = { role: 'ai', kind: 'answer', res, steps: [], done: false };
    st.msgs.push(msg); st.busy = true; render();
    let i = 0;
    const tick = () => {
      if (i < plan.length) { msg.steps.push(plan[i++]); render(); setTimeout(tick, 520); }
      else { msg.done = true; st.busy = false; render(); }
    };
    setTimeout(tick, 250);
  }

  function choose(def) {
    const pending = [...st.msgs].reverse().find(m => m.kind === 'clarify' && !m.chosen);
    if (!pending) return;
    pending.chosen = def; st.newcomerDef = def;
    st.msgs.push({ role: 'user', text: DEFS[def] });
    answer(pending.q, 'q1');
  }

  // ---------- 界面 ----------
  const chips = keys => `<div class="ask-chips">${keys.map(k => `<button type="button" data-ask-q="${k}">${PRESETS[k]}</button>`).join('')}</div>`;
  function msgHtml(m) {
    if (m.role === 'user') return `<div class="am am-user">${esc(m.text)}</div>`;
    if (m.kind === 'clarify') {
      return `<div class="am am-ai"><p>这里的「新客」指哪一种？两种算法结果不一样。</p>
        ${m.chosen ? '' : `<div class="ask-chips">${Object.entries(DEFS).map(([k, l]) => `<button type="button" data-ask-def="${k}">${l}</button>`).join('')}</div>`}</div>`;
    }
    if (m.kind === 'unknown') {
      return `<div class="am am-ai"><p>这个问题原型里还答不了。演示版能回答下面这几类，正式版接入大模型后可以问得更随意：</p>${chips(Object.keys(PRESETS))}</div>`;
    }
    const r = m.res;
    const steps = `<ol class="ask-steps">${m.steps.map(s => `<li>${icon('check', 13)}<span><code>${esc(s.call)}</code><small>${esc(s.result)}</small></span></li>`).join('')}${m.done ? '' : '<li class="busy"><i></i><span>正在查…</span></li>'}</ol>`;
    if (!m.done) return `<div class="am am-ai">${steps}</div>`;
    return `<div class="am am-ai am-answer">
      <p class="ask-lead">${r.lead}</p>
      ${r.table ? `<div class="at-wrap">${r.table}</div>` : ''}
      <p class="ask-def">${icon('info', 13)}<span>${r.def}</span></p>
      <details class="ask-trace"><summary>查询过程（${m.steps.length} 步）</summary>${steps}</details>
      <div class="ask-acts">${r.actions.map(([l, page, patch]) => `<button type="button" class="btn sm" data-ask-go="${page}" data-ask-patch='${JSON.stringify(patch || {})}'>${l}</button>`).join('')}</div>
      ${m === st.msgs[st.msgs.length - 1] ? `<p class="ask-more">还可以问：</p>${chips(r.next)}` : ''}
    </div>`;
  }

  function render() {
    const root = document.getElementById('ask-root');
    if (!root) return;
    root.classList.toggle('open', st.open);
    const body = root.querySelector('.ask-body');
    body.innerHTML = `<div class="am am-ai"><p>可以用中文问门店的经营数据，我会去查，然后告诉你结论、口径和怎么算的。比如：</p>${chips(Object.keys(PRESETS))}</div>`
      + st.msgs.map(msgHtml).join('');
    body.scrollTop = body.scrollHeight;
    root.querySelector('.ask-send').disabled = st.busy;
  }

  function open() { st.open = true; render(); setTimeout(() => document.querySelector('#ask-root input')?.focus(), 50); }
  function close() { st.open = false; render(); document.querySelector('#ask-root .ask-fab')?.focus(); }

  function init() {
    const root = document.getElementById('ask-root');
    root.innerHTML = `<button type="button" class="ask-fab" data-ask-open>${icon('chat', 18)}问数据</button>
      <aside class="ask-panel" role="dialog" aria-label="问数据">
        <header class="ask-h"><b>问数据</b><span class="chip">原型演示</span><button type="button" class="icon-btn" data-ask-close aria-label="关闭">${icon('close', 18)}</button></header>
        <div class="ask-body" aria-live="polite"></div>
        <form class="ask-input"><input type="text" placeholder="用中文问，比如：上个月哪家店营收最高？" aria-label="输入问题" maxlength="80"><button type="submit" class="btn sm primary ask-send">发送</button></form>
        <p class="ask-foot">演示版用预设规则和原型里的模拟数据算答案，正式版接入大模型。</p>
      </aside>`;
    root.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.askOpen != null) open();
      if (t.dataset.askClose != null) close();
      if (t.dataset.askQ) ask(PRESETS[t.dataset.askQ]);
      if (t.dataset.askDef) choose(t.dataset.askDef);
      if (t.dataset.askGo) {
        Admin.go(t.dataset.askGo, JSON.parse(t.dataset.askPatch || '{}'));
        if (matchMedia('(max-width: 640px)').matches) close();
      }
    });
    root.addEventListener('submit', e => {
      e.preventDefault();
      const input = root.querySelector('input');
      if (ask(input.value) !== false) input.value = '';
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.open) close(); });
    render();
  }

  return {
    init, open, close,
    preset: k => ask(PRESETS[k]),
    setMode: m => (document.getElementById('ask-root').hidden = m !== 'admin'),
    reset: () => { Object.assign(st, { open: false, busy: false, msgs: [], newcomerDef: null }); render(); },
  };
})();
