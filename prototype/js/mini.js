/* 微信小程序原型：每部手机一个导航栈，页面是返回 {title, body, footer, ...} 的函数 */

const Mini = (() => {
  const P = {};
  const TABS = { home: ['首页', 'home'], courses: ['约课', 'calendar'], wallet: ['卡包', 'wallet'], me: ['我的', 'user'] };

  // ---------- 导航 ----------
  function reset() {
    Object.keys(S.users).forEach(uid => {
      if (P[uid]) { clearTimeout(P[uid].tt); clearTimeout(P[uid].bt); clearTimeout(P[uid].scanT); }
      P[uid] = { stack: [{ r: 'home' }], sheet: null, toast: null, banner: null };
    });
  }
  const cur = uid => P[uid].stack[P[uid].stack.length - 1];
  const other = uid => Object.keys(S.users).find(x => x !== uid);
  function go(uid, route) { P[uid].stack.push(route); P[uid].sheet = null; render(uid, true); }
  function replace(uid, route) { P[uid].stack[P[uid].stack.length - 1] = route; P[uid].sheet = null; render(uid, true); }
  function back(uid) { if (P[uid].stack.length > 1) P[uid].stack.pop(); P[uid].sheet = null; render(uid, true); }
  function tab(uid, r, extra = {}) { P[uid].stack = [{ r, ...extra }]; P[uid].sheet = null; render(uid, true); }
  function sheet(uid, s) { P[uid].sheet = s; render(uid); }
  function closeSheet(uid) { P[uid].sheet = null; render(uid); }
  function toast(uid, text, ms = 1900) {
    P[uid].toast = text; render(uid);
    clearTimeout(P[uid].tt); P[uid].tt = setTimeout(() => { P[uid].toast = null; render(uid); }, ms);
  }
  function banner(uid, b) {
    P[uid].banner = b; render(uid);
    clearTimeout(P[uid].bt); P[uid].bt = setTimeout(() => { P[uid].banner = null; render(uid); }, 8000);
  }
  function sync() { Object.keys(P).forEach(u => render(u)); Main.onData(); }

  // ---------- 外壳 ----------
  function render(uid, resetScroll = false) {
    const root = document.getElementById('phone-' + uid);
    if (!root || !P[uid]) return;
    const prev = root.querySelector('.mp-body');
    const scroll = prev && !resetScroll ? prev.scrollTop : 0;
    const route = cur(uid);
    const page = PAGES[route.r](uid, route);
    root.dataset.top = page.top || 'light';
    root.innerHTML = statusBar()
      + (page.raw ?? (nav(uid, page)
        + `<div class="mp-body ${page.bodyCls || ''}">${page.body}</div>`
        + (page.footer ? `<div class="mp-footer">${page.footer}</div>` : '')
        + (page.tabbar ? tabbar(route.r) : '')))
      + overlays(uid);
    const nb = root.querySelector('.mp-body');
    if (nb) nb.scrollTop = scroll;
    page.after?.(root);
    Main.updateLabels();
  }

  function statusBar() {
    return `<div class="sb"><span>${nowHM()}</span><span class="sb-r" aria-hidden="true">
      <svg width="18" height="11" viewBox="0 0 18 11"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="6" rx="1"/><rect x="10" y="2.5" width="3" height="8.5" rx="1"/><rect x="15" y="0" width="3" height="11" rx="1"/></svg>
      <svg width="16" height="11" viewBox="0 0 16 11"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.3 10.3 0 0 0 8 .4 10.3 10.3 0 0 0 .8 3.3L2 4.6a8.5 8.5 0 0 1 6-2.4zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.6 6.6 0 0 0 8 4 6.6 6.6 0 0 0 3.4 5.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3zM8 9.4 9.9 7.5a2.8 2.8 0 0 0-3.8 0z"/></svg>
      <span class="batt"><i></i></span></span></div>`;
  }
  function capsule() {
    return `<div class="capsule" aria-hidden="true"><span class="cap-dots"><i></i><i></i><i></i></span><span class="cap-div"></span><span class="cap-ring"></span></div>`;
  }
  function nav(uid, page) {
    if (page.brandNav) {
      return `<div class="mp-nav brand"><span class="nav-brand"><img src="assets/logo.jpg" alt="">BENCHMARK</span>${capsule()}</div>`;
    }
    const canBack = P[uid].stack.length > 1;
    return `<div class="mp-nav"><div class="nav-l">${canBack ? `<button class="nav-back" data-a="back" aria-label="返回">${icon('left', 22)}</button>` : ''}</div>
      <div class="nav-t">${esc(page.title || '')}</div><div class="nav-r">${capsule()}</div></div>`;
  }
  function tabbar(active) {
    return `<nav class="mp-tabbar">${Object.entries(TABS).map(([k, [label, ic]]) =>
      `<button data-a="tab" data-v="${k}" class="${k === active ? 'on' : ''}" ${k === active ? 'aria-current="page"' : ''}><span class="tb-ic">${icon(ic, 22)}</span><span>${label}</span></button>`).join('')}</nav>`;
  }
  function overlays(uid) {
    const p = P[uid]; let h = '';
    if (p.sheet) h += `<div class="sheet-mask" data-a="mask"><div class="sheet" role="dialog">${SHEETS[p.sheet.type](uid, p.sheet)}</div></div>`;
    if (p.toast) h += `<div class="mp-toast" role="status">${p.toast}</div>`;
    if (p.banner) h += `<button class="wx-banner" data-a="openBanner"><span class="wb-app ${p.banner.kind === 'chat' ? '' : 'mp'}">${p.banner.kind === 'chat' ? WX_LOGO : '<img src="assets/logo.jpg" alt="">'}</span>
      <span class="wb-text"><b>${p.banner.kind === 'chat' ? '微信' : 'BENCHMARK 攀岩馆'}</b><span>${esc(p.banner.text)}</span></span><small>现在</small></button>`;
    return h;
  }
  const WX_LOGO = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#fff" d="M9.2 4C5.2 4 2 6.7 2 10c0 1.9 1 3.5 2.6 4.6L4 16.8l2.4-1.3c.9.3 1.8.4 2.8.4h.5a5.3 5.3 0 0 1-.2-1.4c0-3.3 3.1-5.9 6.9-5.9h.5C16.2 5.8 13 4 9.2 4zm-2.4 3.4a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm4.9 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zM16.4 9.6c-3.2 0-5.7 2.1-5.7 4.7s2.5 4.7 5.7 4.7c.7 0 1.3-.1 1.9-.3l1.9 1-.5-1.7c1.4-.9 2.3-2.2 2.3-3.7 0-2.6-2.5-4.7-5.6-4.7zm-1.9 2.6a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4zm3.8 0a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4z"/></svg>`;

  // ---------- 小部件 ----------
  const segs = (list, sel) => `<div class="segs" role="tablist">${list.map(([k, l]) => `<button role="tab" aria-selected="${k === sel}" class="${k === sel ? 'on' : ''}" data-a="seg" data-v="${k}">${l}</button>`).join('')}</div>`;
  const dayStrip = sel => `<div class="days">${[0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = addDays(TODAY, i);
    return `<button class="${i === sel ? 'on' : ''}" data-a="day" data-v="${i}"><small>${i === 0 ? '今天' : i === 1 ? '明天' : WEEK[d.getDay()]}</small><b>${d.getDate()}</b></button>`;
  }).join('')}</div>`;
  const seats = (n, cap) => `<span class="seats" aria-hidden="true"><i style="width:${Math.min(100, n / cap * 100)}%"></i></span>`;
  const empty = (title, text, btn) => `<div class="empty"><img src="assets/mark.png" alt=""><b>${title}</b><p>${text}</p>${btn || ''}</div>`;
  const dayLabel = k => { const d = parseKey(k), diff = daysLeft(k); return diff === 0 ? '今天' : diff === 1 ? '明天' : `${fmtMD(d)} ${WEEK[d.getDay()]}`; };
  const isPast = (k, hm) => k === todayKey() && hm <= nowHM();
  const card = (uid, id) => S.users[uid].cards.find(c => c.id === id);
  const lessonCard = (uid, kind) => S.users[uid].cards.find(c => c.kind === kind && c.left > 0 && c.end >= todayKey());

  function mcard(uid, c, detail = false) {
    const t = todayKey();
    if (c.kind === 'period') {
      const total = Math.round((parseKey(c.end) - parseKey(c.start)) / DAY) + 1;
      const future = c.start > t, left = future ? total : daysLeft(c.end) + 1;
      const ref = canRefer(uid);
      return `<div class="mcard period">
        <img class="mc-mark" src="assets/mark.png" alt="">
        <div class="mc-kind">期限卡${future ? `<span class="chip">${fmtMD(parseKey(c.start))}生效</span>` : ''}</div>
        <div class="mc-name">${esc(c.name)}</div>
        <div class="mc-num"><b>${left}</b><span>天${future ? '' : '后到期'}</span></div>
        <div class="mc-bar"><i style="width:${left / total * 100}%"></i></div>
        <div class="mc-meta">${fmtDot(c.start)} – ${fmtDot(c.end)}</div>
        ${future ? '' : `<div class="mc-acts"><button class="btn sm ${ref ? '' : 'ghost'}" data-a="goto" data-v="referral">${icon('users', 16)}${ref ? '本月可带 1 位朋友' : '本月老带新已用'}</button><button class="btn sm dark" data-a="scan">${icon('scan', 16)}入场</button></div>`}
      </div>`;
    }
    if (c.kind === 'count' || c.kind === 'gift') {
      const gift = c.kind === 'gift';
      return `<div class="mcard count ${gift ? 'gift' : ''}">
        ${gift ? `<span class="ribbon">${esc(userName(c.from))} 送的</span>` : ''}
        <div class="mc-kind">${gift ? '好友赠送' : '次卡'}</div>
        <div class="mc-name">${gift ? '攀岩次卡' : esc(c.name)}</div>
        <div class="mc-num"><b>${c.left}</b><span>/ ${c.total} 次</span></div>
        <div class="mc-meta">${fmtDot(c.end)} 前有效</div>
        ${c.left > 0 ? `<div class="mc-acts">${gift ? '' : `<button class="btn sm" data-a="shareCard" data-v="${c.id}">${icon('gift', 16)}送给朋友</button>`}
          ${!gift && !detail ? `<button class="btn sm ghost" data-a="go" data-v='{"r":"cardDetail","id":"${c.id}"}'>记录</button>` : ''}
          <button class="btn sm dark" data-a="scan">${icon('scan', 16)}入场</button></div>` : ''}
      </div>`;
    }
    if (c.kind === 'referral') {
      const inv = S.users[c.from].checkins[0];
      const state = c.used ? '已使用，欢迎常来' : inv ? `${esc(userName(c.from))} 今天 ${inv.time} 已入场，现在就能用` : `等 ${esc(userName(c.from))} 今天到馆扫码后，这张券当天可用`;
      return `<div class="mcard referral ${c.used ? 'used' : ''}">
        <div class="mc-kind">老带新</div>
        <div class="mc-name">免费体验券</div>
        <p class="mc-from">${holdAvatar(S.users[c.from].initial, S.users[c.from].tone, 26, 1)}${esc(userName(c.from))} 邀请你来爬一次</p>
        <div class="mc-state ${inv && !c.used ? 'ready' : ''}">${icon(c.used ? 'check' : inv ? 'bolt' : 'clock', 16)}<span>${state}</span></div>
        <div class="mc-meta">${fmtDot(c.end)} 前有效</div>
        ${!c.used && inv ? `<div class="mc-acts"><button class="btn sm dark" data-a="scan">${icon('scan', 16)}扫码入场</button></div>` : ''}
      </div>`;
    }
    // 私教 / 团课课时
    return `<div class="mcard lesson">
      <div class="mc-kind">${c.kind === 'pt' ? '私教课时' : '团课次数'}</div>
      <div class="mc-name">${esc(c.name)}</div>
      <div class="mc-num"><b>${c.left}</b><span>/ ${c.total} ${c.kind === 'pt' ? '节' : '次'}</span></div>
      <div class="mc-meta">${fmtDot(c.end)} 前有效</div>
      ${c.left > 0 ? `<div class="mc-acts"><button class="btn sm primary" data-a="goto" data-v="courses:${c.kind === 'pt' ? 'pt' : 'class'}">${icon('calendar', 16)}去约课</button></div>` : ''}
    </div>`;
  }

  function classRow(uid, k) {
    const mine = k.members.includes(uid), full = k.booked >= k.cap, past = isPast(k.date, k.start);
    const btn = mine ? `<button class="btn sm ghost" data-a="cancelClassAsk" data-v="${k.id}">已预约</button>`
      : past ? `<button class="btn sm" disabled>已开始</button>`
        : full ? `<button class="btn sm" disabled>已约满</button>`
          : `<button class="btn sm primary" data-a="bookClass" data-v="${k.id}">预约</button>`;
    return `<div class="class-row ${mine ? 'mine' : ''}">
      <div class="cr-time"><b>${k.start}</b><small>${k.end}</small></div>
      <div class="cr-main"><b>${esc(k.name)}</b>
        <div class="cr-meta"><span class="lv lv-${k.level}">${k.level}</span><span>${esc(coach(k.coach).name)}，${storeName(k.store)}</span></div>
        <div class="cr-seats">${seats(k.booked, k.cap)}<small>${k.booked}/${k.cap}</small></div></div>
      <div class="cr-act">${btn}</div></div>`;
  }

  function evCover(e, big = false) {
    const d = parseKey(e.date);
    return `<div class="ev-cover tone-${e.tone} ${big ? 'big' : ''}">
      <span class="ev-holds" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="ev-date"><b>${d.getDate()}</b><small>${d.getMonth() + 1}月 ${WEEK[d.getDay()]}</small></span>
      <span class="ev-title">${esc(e.title)}</span></div>`;
  }

  // ---------- 页面 ----------
  const PAGES = {
    home(uid) {
      const u = S.users[uid], pc = periodCard(uid);
      const countLeft = u.cards.filter(c => (c.kind === 'count' || c.kind === 'gift') && c.end >= todayKey()).reduce((s, c) => s + c.left, 0);
      const voucher = u.cards.find(c => c.kind === 'referral' && !c.used);
      const sub = pc ? `${pc.name}还有 ${daysLeft(pc.end) + 1} 天到期` : countLeft ? `次卡还剩 ${countLeft} 次` : voucher ? '你有一张老带新体验券' : '还没有入场卡';
      const inToday = u.checkins[0];
      const next = [...u.bookings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
      const upcoming = S.classes.filter(k => k.date === todayKey() && !isPast(k.date, k.start)).concat(S.classes.filter(k => k.date === dkey(addDays(TODAY, 1)))).slice(0, 4);
      const e2 = S.events.find(e => e.id === 'e2');
      return {
        brandNav: true, top: 'olive', tabbar: true, body: `
        <section class="home-hero">
          <img class="hero-mark" src="assets/mark.png" alt="">
          <p class="hello">${greet()}，${esc(u.name)}</p>
          <p class="hello-sub">${sub}</p>
          <button class="scan-plate ${inToday ? 'done' : ''}" data-a="scan">
            <span class="sp-in"><span class="sp-ic">${icon(inToday ? 'check' : 'scan', 28)}</span>
            <span class="sp-t"><b>${inToday ? '今天已入场' : '扫码入场'}</b><small>${inToday ? `${inToday.time} 用${esc(inToday.label)}进的馆` : '对准前台的二维码扫一下'}</small></span>
            ${icon('right', 22)}</span>
          </button>
        </section>
        <div class="quick">
          ${[['shop', '购卡', 'ticket', 'chalk', 0], ['courses:class', '团课', 'users', 'volume', 1], ['courses:pt', '私教', 'dumbbell', 'olive', 2], ['courses:event', '活动', 'flag', 'white', 3]].map(([v, l, ic, tone, s]) =>
            `<button class="q" data-a="goto" data-v="${v}"><span class="hold tone-${tone}" style="--s:52px;border-radius:${HOLD_SHAPES[s]}">${icon(ic, 24)}</span><span>${l}</span></button>`).join('')}
        </div>
        ${pc ? `<button class="refer-board" data-a="goto" data-v="referral">
            <span class="rb-plank" aria-hidden="true"></span>
            <span class="rb-t"><b>老带新</b><span>${canRefer(uid) ? '这个月还能免费带 1 位新朋友来爬' : '本月名额已用，下月 1 号恢复'}</span></span>
            <span class="btn sm dark">${canRefer(uid) ? '去邀请' : '查看'}</span></button>`
          : voucher ? `<button class="refer-board" data-a="tab" data-v="wallet"><span class="rb-plank" aria-hidden="true"></span>
            <span class="rb-t"><b>老带新体验券</b><span>${esc(userName(voucher.from))} 到馆扫码后，你当天就能免费入场</span></span><span class="btn sm dark">查看</span></button>`
          : `<div class="panel first-time"><h3>第一次来？</h3><p>买一张单次票（含租鞋），或者让有期限卡的朋友用「老带新」带你免费来一次。</p>
            <div class="row"><button class="btn sm primary" data-a="buy" data-v="s1">单次票 ${yuan(product('s1').price)}</button><button class="btn sm" data-a="goto" data-v="shop">看看其他卡</button></div></div>`}
        ${next ? `<div class="sec-h"><h3>我的预约</h3><button class="link" data-a="go" data-v='{"r":"bookings"}'>全部</button></div>
          <div class="panel booking-mini"><span class="bk-kind k-${next.kind}">${{ pt: '私教', class: '团课', event: '活动' }[next.kind]}</span><div><b>${esc(next.title)}</b><small>${dayLabel(next.date)} ${next.time}</small></div></div>` : ''}
        <div class="sec-h"><h3>最近的团课</h3><button class="link" data-a="goto" data-v="courses:class">课表</button></div>
        <div class="hscroll">${upcoming.map(k => `<button class="mini-class" data-a="goto" data-v="courses:class:${daysLeft(k.date)}">
          <small>${dayLabel(k.date)} ${k.start}</small><b>${esc(k.name)}</b><span><span class="lv lv-${k.level}">${k.level}</span>${storeName(k.store)}</span>${seats(k.booked, k.cap)}</button>`).join('')}</div>
        <div class="sec-h"><h3>馆内动态</h3></div>
        ${S.routeNews ? `<div class="panel news"><span class="news-tag">新线预告</span><b>${esc(S.routeNews.branch)}${fmtMD(parseKey(S.routeNews.date))}换线</b>
          <p>${esc(S.routeNews.area)}，${S.routeNews.routes} 条新线${S.routeNews.theme ? `，主题「${esc(S.routeNews.theme)}」` : ''}。换线当天这块区域会封闭半天。</p></div>` : ''}
        <button class="panel news" data-a="go" data-v='{"r":"event","id":"e2"}'>
          <span class="news-tag">换线</span><b>B 区新线路已经定好了</b>
          <p>14 条新线，难度 V0–V7。${fmtMD(parseKey(e2.date))}开放日，定线师现场讲线。</p></button>
        <div class="foot-space"></div>`,
      };
    },

    courses(uid, r) {
      const seg = r.seg || 'class';
      let body = '';
      if (seg === 'class') {
        const day = r.day || 0, key = dkey(addDays(TODAY, day));
        const list = S.classes.filter(k => k.date === key);
        const cc = lessonCard(uid, 'class');
        body = dayStrip(day) + `<p class="hint">${cc ? `你的团课次数还剩 ${cc.left} 次，约课时自动抵扣。` : `团课单次 ${yuan(CLASS_SINGLE_PRICE)}，<button class="link" data-a="go" data-v='{"r":"shop","seg":"class"}'>买次数包更划算</button>。`}</p>`
          + (list.length ? `<div class="list">${list.map(k => classRow(uid, k)).join('')}</div>` : empty('这天没有团课', '换一天看看，或者约一节私教。'));
      } else if (seg === 'pt') {
        const pc = lessonCard(uid, 'pt');
        body = `<p class="hint">${pc ? `你的私教课还剩 ${pc.left} 节，约课时自动抵扣。` : `<button class="link" data-a="go" data-v='{"r":"shop","seg":"pt"}'>买私教课包</button>比单节约课便宜。`}</p>
          <div class="list">${COACHES.map((c, i) => `<button class="coach-row" data-a="go" data-v='{"r":"coach","id":"${c.id}"}'>
            ${holdAvatar(c.ab, c.tone, 54, i)}
            <span class="co-main"><b>${esc(c.name)}</b><span class="co-tags">${c.tags.map(t => `<span>${t}</span>`).join('')}</span><small>攀龄 ${c.years} 年，评分 ${c.rating.toFixed(1)}</small></span>
            <span class="co-price"><b>${yuan(c.price)}</b><small>每节</small></span></button>`).join('')}</div>`;
      } else {
        body = `<div class="list">${[...S.events].sort((a, b) => a.date.localeCompare(b.date)).map(e => {
          const mine = e.members.includes(uid);
          return `<button class="event-card" data-a="go" data-v='{"r":"event","id":"${e.id}"}'>${evCover(e)}
            <span class="ev-info"><span>${e.start}–${e.end}，${esc(e.area)}</span><b>${e.fee ? yuan(e.fee) : '免费'}</b></span>
            <span class="ev-foot">${seats(e.joined, e.cap)}<small>${mine ? '你已报名' : `已报名 ${e.joined}/${e.cap}`}</small></span></button>`;
        }).join('')}</div>`;
      }
      return { title: '约课', tabbar: true, body: segs([['class', '团课'], ['pt', '私教'], ['event', '活动']], seg) + `<div class="pad">${body}</div><div class="foot-space"></div>` };
    },

    coach(uid, r) {
      const c = coach(r.id), i = COACHES.indexOf(c);
      const day = r.day || 0, key = dkey(addDays(TODAY, day));
      const slots = PT_HOURS.map(h => {
        const taken = S.ptTaken[`${c.id}|${key}|${h}`];
        const past = isPast(key, `${pad(h)}:00`);
        const cls = taken === uid ? 'mine' : taken || past ? 'off' : r.hour === h ? 'on' : '';
        const label = taken === uid ? '你已约' : taken ? '已约满' : past ? '已过' : '可约';
        return `<button class="slot ${cls}" ${taken || past ? 'disabled' : ''} data-a="slot" data-v="${h}"><b>${pad(h)}:00</b><small>${label}</small></button>`;
      }).join('');
      return {
        title: '私教', body: `
        <div class="coach-head">${holdAvatar(c.ab, c.tone, 76, i)}
          <div><h2>${esc(c.name)}</h2><div class="co-tags">${c.tags.map(t => `<span>${t}</span>`).join('')}</div><small>攀龄 ${c.years} 年，评分 ${c.rating.toFixed(1)}</small></div></div>
        <p class="coach-bio">${esc(c.bio)}</p>
        <div class="pad"><div class="sec-h flush"><h3>选一个时间</h3><small>每节 60 分钟</small></div>
        ${dayStrip(day)}<div class="slots">${slots}</div></div><div class="foot-space"></div>`,
        footer: `<div class="ft-sum">${r.hour != null ? `<b>${dayLabel(key)} ${pad(r.hour)}:00</b><small>${esc(c.name)} 的私教课</small>` : '<small>先选一个时间</small>'}</div>
          <button class="btn primary" data-a="bookPt" ${r.hour == null ? 'disabled' : ''}>预约</button>`,
      };
    },

    event(uid, r) {
      const e = S.events.find(x => x.id === r.id), mine = e.members.includes(uid), full = e.joined >= e.cap;
      const faces = BASE.members.slice(3, 9).map((m, i) => holdAvatar(m.name[0], ['olive', 'chalk', 'volume', 'white'][i % 4], 30, i)).join('');
      return {
        title: '活动详情', body: `${evCover(e, true)}
        <div class="pad">
          <ul class="info-rows">
            <li>${icon('clock', 18)}<span>${dayLabel(e.date)} ${e.start}–${e.end}</span></li>
            <li>${icon('pin', 18)}<span>${esc(e.area)}</span></li>
            <li>${icon('yuan', 18)}<span>${e.fee ? `${yuan(e.fee)} / 人` : '免费'}</span></li>
            <li>${icon('users', 18)}<span>已报名 ${e.joined} 人，限 ${e.cap} 人</span></li></ul>
          <p class="ev-desc">${esc(e.desc)}</p>
          <div class="faces">${faces}<small>等 ${e.joined} 人已报名</small></div>
        </div><div class="foot-space"></div>`,
        footer: `<div class="ft-sum"><b>${e.fee ? yuan(e.fee) : '免费'}</b><small>${full ? '名额已满' : `还剩 ${e.cap - e.joined} 个名额`}</small></div>
          ${mine ? '<button class="btn" disabled>已报名</button>' : full ? '<button class="btn" disabled>名额已满</button>' : `<button class="btn primary" data-a="joinEvent" data-v="${e.id}">报名</button>`}`,
      };
    },

    wallet(uid) {
      const u = S.users[uid], t = todayKey();
      const live = c => c.kind === 'period' ? c.end >= t : c.kind === 'referral' ? !c.used && c.end >= t : c.left > 0 && c.end >= t;
      const entry = u.cards.filter(c => ['period', 'count', 'gift', 'referral'].includes(c.kind) && live(c));
      const lessons = u.cards.filter(c => ['pt', 'class'].includes(c.kind) && live(c));
      const done = u.cards.filter(c => !live(c));
      if (!u.cards.length) return { title: '卡包', tabbar: true, body: empty('卡包还是空的', '买一张卡，或者请有卡的朋友把次数送给你。', '<button class="btn primary" data-a="goto" data-v="shop">去购卡</button>') };
      return {
        title: '卡包', tabbar: true, body: `<div class="pad">
          ${entry.length ? `<div class="sec-h flush"><h3>入场卡</h3><small>${entry.length} 张</small></div><div class="cards">${entry.map(c => mcard(uid, c)).join('')}</div>` : ''}
          ${lessons.length ? `<div class="sec-h flush"><h3>课程</h3></div><div class="cards">${lessons.map(c => mcard(uid, c)).join('')}</div>` : ''}
          ${done.length ? `<details class="done"><summary>已用完或已过期（${done.length}）</summary><div class="cards">${done.map(c => mcard(uid, c)).join('')}</div></details>` : ''}
          <button class="btn block" data-a="goto" data-v="shop">${icon('plus', 18)}购买新卡</button>
        </div><div class="foot-space"></div>`,
      };
    },

    cardDetail(uid, r) {
      const c = card(uid, r.id), log = S.users[uid].log[c.id] || [];
      return {
        title: c.name, body: `<div class="pad">${mcard(uid, c, true)}
          <div class="sec-h flush"><h3>使用记录</h3></div>
          <ul class="log">${log.map(l => `<li><span>${l.t}</span><b>${esc(l.text)}</b><em class="${l.d < 0 ? 'neg' : 'pos'}">${l.d > 0 ? '+' : ''}${l.d || ''}${l.d ? ' 次' : ''}</em></li>`).join('') || '<li><span>还没有记录</span></li>'}</ul>
          <p class="fine">同一天多次进出只扣 1 次。送给朋友的次数会从这张卡里扣除，朋友领取后可以在有效期内使用。</p></div>`,
      };
    },

    me(uid) {
      const u = S.users[uid], first = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
      const lead = (first.getDay() + 6) % 7, days = endOfMonth(TODAY).getDate();
      const cells = Array(lead).fill('<span></span>').concat(Array.from({ length: days }, (_, i) => {
        const d = i + 1, v = u.visits.includes(d), today = d === TODAY.getDate();
        return `<span class="${v ? 'v' : ''} ${today ? 'today' : ''} ${d > TODAY.getDate() ? 'future' : ''}">${d}</span>`;
      })).join('');
      const pc = periodCard(uid);
      const upcoming = u.bookings.filter(b => b.date >= todayKey()).length;
      return {
        title: '我的', tabbar: true, body: `<div class="pad">
          <div class="me-head">${holdAvatar(u.initial, u.tone, 64, 2)}<div><h2>${esc(u.name)}</h2><small>${u.phone}</small>
            <span class="chip ${pc ? 'olive' : ''}">${pc ? `${pc.name}会员` : u.cards.length ? '次卡用户' : '新朋友'}</span></div></div>
          <div class="stats"><div><b>${u.visits.length}</b><small>本月入场</small></div><div><b>${u.totalVisits}</b><small>累计入场</small></div><div><b>${upcoming}</b><small>待上的课</small></div></div>
          <div class="panel cal"><div class="cal-h"><b>${TODAY.getMonth() + 1} 月攀爬日历</b><small><i class="dot"></i>来过</small></div>
            <div class="cal-g">${['一', '二', '三', '四', '五', '六', '日'].map(w => `<em>${w}</em>`).join('')}${cells}</div></div>
          <div class="menu">
            <button data-a="go" data-v='{"r":"bookings"}'>${icon('calendar', 20)}<span>我的预约</span><small>${u.bookings.length || ''}</small>${icon('right', 16)}</button>
            <button data-a="go" data-v='{"r":"shares"}'>${icon('gift', 20)}<span>分享与邀请</span><small></small>${icon('right', 16)}</button>
            <button data-a="go" data-v='{"r":"orders"}'>${icon('list', 20)}<span>订单记录</span><small></small>${icon('right', 16)}</button>
            <button data-a="docs">${icon('shield', 20)}<span>保险与告知书</span><small>${u.policy ? '今天已投保' : ''}</small>${icon('right', 16)}</button>
            <button data-a="venue">${icon('pin', 20)}<span>场馆信息</span><small>10:00–23:00</small>${icon('right', 16)}</button>
          </div></div><div class="foot-space"></div>`,
      };
    },

    bookings(uid) {
      const list = [...S.users[uid].bookings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return {
        title: '我的预约', body: `<div class="pad">${list.length ? `<div class="list">${list.map(b => `<div class="panel booking-mini"><span class="bk-kind k-${b.kind}">${{ pt: '私教', class: '团课', event: '活动' }[b.kind]}</span>
          <div><b>${esc(b.title)}</b><small>${dayLabel(b.date)} ${b.time}，${esc(b.who)}</small></div></div>`).join('')}</div>`
          : empty('还没有预约', '去约一节团课或私教吧。', '<button class="btn primary" data-a="goto" data-v="courses:class">去约课</button>')}</div>`,
      };
    },

    shares(uid) {
      const sent = S.shares.filter(s => s.from === uid), got = S.shares.filter(s => s.to === uid);
      const st = { pending: '等待领取', claimed: '已领取', used: '已入场' };
      const row = (s, out) => `<li><span class="sh-ic">${icon(s.kind === 'count' ? 'gift' : 'users', 18)}</span><div><b>${s.kind === 'count' ? `${esc(s.cardName)} ${s.qty} 次` : '老带新邀请'}</b>
        <small>${out ? `发给 ${esc(s.toName)}` : `来自 ${esc(userName(s.from))}`}，今天 ${s.time}</small></div><span class="chip ${s.status === 'pending' ? '' : 'olive'}">${st[s.status]}</span></li>`;
      return {
        title: '分享与邀请', body: `<div class="pad">
          <div class="sec-h flush"><h3>我送出的</h3></div>${sent.length ? `<ul class="share-list">${sent.map(s => row(s, true)).join('')}</ul>` : '<p class="hint">还没有送出过次卡或邀请。</p>'}
          <div class="sec-h flush"><h3>我收到的</h3></div>${got.length ? `<ul class="share-list">${got.map(s => row(s, false)).join('')}</ul>` : '<p class="hint">朋友送你的次卡和邀请会出现在这里。</p>'}</div>`,
      };
    },

    orders(uid) {
      const list = S.orders.filter(o => o.name === S.users[uid].name);
      return {
        title: '订单记录', body: `<div class="pad">${list.length ? `<ul class="log">${list.map(o => `<li><span>${o.when}</span><b>${esc(o.product)}</b><em>${yuan(o.amount)}</em></li>`).join('')}</ul>`
          : empty('还没有订单', '在这里购买的卡和课程都会留下记录。')}</div>`,
      };
    },

    shop(uid, r) {
      const seg = r.seg || 'period';
      const intro = {
        period: '有效期内不限次数入场，每个月还能免费带 1 位新朋友来爬。',
        count: '次数可以分次送给朋友，朋友在小程序里领取后就能扫码入场。',
        pt: '买好课包后，在「约课 → 私教」里挑教练和时间。',
        class: `团课单节 ${yuan(CLASS_SINGLE_PRICE)}，买次数包更划算。`,
      }[seg];
      const list = S.products.filter(p => p.cat === seg && p.on);
      return {
        title: '购卡', body: segs([['period', '期限卡'], ['count', '次卡'], ['pt', '私教课'], ['class', '团课']], seg) + `<div class="pad"><p class="hint">${intro}</p>
          <div class="list">${list.map(p => `<div class="prod ${p.cat}">
            <div class="prod-h"><b class="prod-name">${esc(p.name)}</b>${p.tag ? `<span class="chip olive">${esc(p.tag)}</span>` : ''}</div>
            <p class="prod-desc">${esc(p.desc)}</p>
            ${p.perks.length ? `<ul class="perks">${p.perks.map(x => `<li>${icon('check', 14)}${esc(x)}</li>`).join('')}</ul>` : ''}
            <div class="prod-f"><span class="price"><small>¥</small>${p.price.toLocaleString('zh-CN')}${p.orig ? `<s>¥${p.orig.toLocaleString('zh-CN')}</s>` : ''}</span>
            <button class="btn sm primary" data-a="checkout" data-v="${p.id}">购买</button></div></div>`).join('') || empty('暂时没有在售的卡', '前台正在调整价格，稍后再来看看。')}</div></div><div class="foot-space"></div>`,
      };
    },

    checkout(uid, r) {
      const p = product(r.pid), pc = periodCard(uid);
      const rows = [];
      if (p.cat === 'period') {
        const start = pc ? addDays(parseKey(pc.end), 1) : TODAY;
        rows.push(['生效时间', pc ? `${fmtMD(start)}（接在当前${pc.name}之后）` : '付款后立即生效']);
        rows.push(['到期时间', fmtDot(dkey(addDays(start, p.days - 1)))]);
      } else if (p.id === 's1') rows.push(['有效期', '仅限今天']);
      else rows.push(['有效期至', fmtDot(dkey(addMonths(TODAY, p.months)))]);
      rows.push(['优惠券', '暂无可用']);
      return {
        title: '确认订单', body: `<div class="pad">
          <div class="panel co-sum"><span class="co-cat">${CAT[p.cat]}</span><b>${esc(p.name)}</b><p>${esc(p.desc)}</p></div>
          <ul class="kv panel">${rows.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('')}</ul>
          <p class="fine">付款后可以在「卡包」里查看。期限卡生效后不支持退款；次卡和课时包未使用部分可以在 7 天内申请退款。</p></div>`,
        footer: `<div class="ft-sum"><small>合计</small><b class="big">${yuan(p.price)}</b></div><button class="btn primary" data-a="pay">微信支付</button>`,
      };
    },

    paid(uid, r) {
      const c = card(uid, r.cardId), p = product(r.pid);
      const entry = ['period', 'count'].includes(p.cat);
      return {
        title: '支付成功', top: 'olive', bodyCls: 'olive-body', body: `<div class="pad">
          <div class="success-head"><span class="ok-badge">${icon('check', 40)}</span><h2>买好了</h2><p>${esc(p.name)}已经放进你的卡包。</p></div>
          ${mcard(uid, c)}
          <div class="row stack">${entry ? `<button class="btn block dark" data-a="scan">${icon('scan', 18)}现在扫码入场</button>` : `<button class="btn block dark" data-a="goto" data-v="courses:${p.cat === 'pt' ? 'pt' : 'class'}">去约课</button>`}
          <button class="btn block" data-a="tab" data-v="wallet">查看卡包</button></div></div>`,
      };
    },

    scan(uid, r) {
      const cells = (() => { const g = rng(5); let s = ''; for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) { const corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13); if (!corner && g() < 0.45) s += `<rect x="${x}" y="${y}" width="1" height="1"/>`; } return s; })();
      const finder = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" fill="none" stroke-width="1" stroke="currentColor" transform="translate(.5 .5) scale(.857)"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
      return {
        title: '扫码入场', top: 'dark', bodyCls: 'scan-body', body: `<div class="scanview">
          <p class="sv-tip">对准前台的入场二维码</p>
          <p class="sv-store">演示：你现在在${storeName(DEMO_STORE)}</p>
          <div class="frame"><svg class="fake-qr" viewBox="0 0 21 21" aria-hidden="true">${cells}${finder(0, 0)}${finder(14, 0)}${finder(0, 14)}</svg><i class="c1"></i><i class="c2"></i><i class="c3"></i><i class="c4"></i><span class="laser"></span></div>
          <p class="sv-sub">识别中……</p>
          <button class="btn" data-a="scanNow">模拟扫到前台码</button></div>`,
        after() {
          if (r.armed) return; r.armed = true;
          clearTimeout(P[uid].scanT);
          P[uid].scanT = setTimeout(() => { if (cur(uid) === r && !P[uid].sheet) scanned(uid); }, 2400);
        },
      };
    },

    entered(uid, r) {
      const u = S.users[uid], rec = u.checkins.find(c => c.id === r.id) || u.checkins[0];
      return {
        title: '入场', top: 'olive', bodyCls: 'olive-body', body: `<div class="pad entered">
          <span class="ok-badge big">${icon('check', 52)}</span>
          <h2>${r.again ? '今天已经入场过了' : '入场成功'}</h2>
          <div class="en-time">${rec.time}</div>
          <p class="en-sub">${r.again ? '同一天再次进出不会重复扣次，直接进去吧。' : rec.kind === 'referral' ? `欢迎第一次来 BENCHMARK，${esc(userName(rec.from))} 在里面等你。` : u.totalVisits <= 1 ? '欢迎第一次来 BENCHMARK，祝你爬得开心。' : '欢迎回来，祝你今天爬得顺。'}</p>
          <ul class="kv panel"><li><span>门店</span><b>${storeName(DEMO_STORE)}</b></li><li><span>使用</span><b>${esc(rec.label)}</b></li>
            ${rec.left != null ? `<li><span>剩余</span><b>${rec.left} 次</b></li>` : ''}
            ${u.policy ? `<li><span>当日保险</span><b>已生效，今天 24:00 前</b></li>` : ''}
            <li><span>本月</span><b>第 ${u.visits.length} 次来馆</b></li></ul>
          ${rec.kind === 'referral' || u.totalVisits <= 1 ? `<p class="fine">风险告知书已经在小程序里签好，不用再到前台签纸质单。第一次来的话，前台会带你领鞋，再花 5 分钟讲一遍安全须知。</p>` : ''}
          <button class="btn block dark" data-a="tab" data-v="home">完成</button></div>`,
      };
    },

    referral(uid) {
      const ok = canRefer(uid), pc = periodCard(uid);
      const mine = S.shares.filter(s => s.from === uid && s.kind === 'referral');
      const st = { pending: '等待领取', claimed: '已领取，等你们一起来', used: '已入场' };
      return {
        title: '老带新', body: `<div class="pad">
          <div class="refer-hero"><span class="rb-plank" aria-hidden="true"></span><h2>带朋友来爬一次</h2>
            <p>${pc ? `期限卡会员每个月可以免费带 1 位新朋友来体验。` : '办一张期限卡（月卡、季卡、年卡）后，每个月可以免费带 1 位新朋友来体验。'}</p>
            <div class="quota"><b>${ok ? 1 : 0}</b><span>/ 1　${TODAY.getMonth() + 1} 月剩余名额</span></div></div>
          <div class="sec-h flush"><h3>怎么用</h3></div>
          <ol class="steps"><li><b>发邀请</b><span>把邀请卡片发到朋友的微信。</span></li>
            <li><b>朋友领取</b><span>朋友点开卡片，把体验券领进自己的卡包。</span></li>
            <li><b>同一天来</b><span>你到前台扫码入场后，朋友当天扫码就能免费进。</span></li></ol>
          ${mine.length ? `<div class="sec-h flush"><h3>本月邀请</h3></div><ul class="share-list">${mine.map(s => `<li><span class="sh-ic">${icon('users', 18)}</span><div><b>发给 ${esc(s.toName)}</b><small>今天 ${s.time}</small></div><span class="chip ${s.status === 'pending' ? '' : 'olive'}">${st[s.status]}</span></li>`).join('')}</ul>` : ''}
        </div><div class="foot-space"></div>`,
        footer: pc ? `<button class="btn primary block" data-a="invite" ${ok ? '' : 'disabled'}>${ok ? '发给微信好友' : '本月名额已用，下月 1 号恢复'}</button>`
          : `<button class="btn primary block" data-a="go" data-v='{"r":"shop","seg":"period"}'>去办期限卡</button>`,
      };
    },

    claim(uid, r) {
      const sh = S.shares.find(s => s.id === r.shareId), from = S.users[sh.from];
      const own = sh.from === uid, mineClaimed = sh.to === uid, taken = sh.status !== 'pending' && !mineClaimed;
      const isCount = sh.kind === 'count';
      if (r.done || mineClaimed) {
        return {
          title: '领取成功', top: 'olive', bodyCls: 'olive-body', body: `<div class="pad"><div class="success-head"><span class="ok-badge">${icon('check', 40)}</span><h2>放进卡包了</h2>
            <p>${isCount ? `${sh.qty} 次攀岩已经到账，${fmtDot(sh.end)} 前到前台扫码就能用。` : `等 ${esc(from.name)} 哪天到馆扫码入场，你当天扫码就能免费进。`}</p></div>
            ${mcard(uid, S.users[uid].cards.find(c => c.shareId === sh.id))}
            <div class="row stack">${isCount ? `<button class="btn block dark" data-a="scan">${icon('scan', 18)}去扫码入场</button>` : ''}<button class="btn block" data-a="tab" data-v="wallet">查看卡包</button></div></div>`,
        };
      }
      return {
        title: '领取', body: `<div class="claim">
          <div class="claim-card ${isCount ? '' : 'ref'}"><img class="mc-mark" src="assets/mark.png" alt="">
            <p class="cl-from">${holdAvatar(from.initial, from.tone, 34, 1)}<span><b>${esc(from.name)}</b> ${isCount ? '送你' : '邀请你'}</span></p>
            <div class="cl-big">${isCount ? `<b>${sh.qty}</b><span>次攀岩</span>` : '<span class="cl-word">免费来爬一次</span>'}</div>
            <p class="cl-meta">${isCount ? `${fmtDot(sh.end)} 前有效，到前台扫码入场自动扣次` : `本月底（${fmtDot(sh.end)}）前有效`}</p></div>
          ${isCount ? '' : `<div class="panel rule"><b>使用规则</b><p>${esc(from.name)} 到馆扫码入场的当天，你扫码就能免费进。两个人不用同时到，同一天就行。</p></div>`}
          <ul class="kv panel"><li><span>营业时间</span><b>每天 10:00–23:00</b></li><li><span>第一次来</span><b>前台租鞋，讲 5 分钟安全须知</b></li><li><span>穿什么</span><b>宽松运动服就行</b></li></ul>
          <p class="fine center">领取后会出现在小程序「卡包」里。</p></div>`,
        footer: own ? '<button class="btn block" disabled>这是你发出的，等朋友来领</button>'
          : taken ? '<button class="btn block" disabled>已经被别人领走了</button>'
            : `<button class="btn primary block" data-a="claim">领取到我的卡包</button>`,
      };
    },

    wechat(uid) {
      const o = S.users[other(uid)], msgs = S.chats[uid];
      const bubble = m => {
        const mine = m.from === uid, who = S.users[m.from];
        const av = `<span class="wx-av tone-${who.tone}">${who.initial}</span>`;
        let inner;
        if (m.type === 'text') inner = `<span class="wx-bub ${mine ? 'me' : ''}">${esc(m.text)}</span>`;
        else {
          const sh = S.shares.find(s => s.id === m.shareId);
          const title = sh.kind === 'count' ? `${who.name} 送你 ${sh.qty} 次攀岩入场` : `${who.name} 邀请你免费来爬一次`;
          inner = `<button class="wx-mp" data-a="openShare" data-v="${sh.id}"><span class="wm-h"><img src="assets/logo.jpg" alt="">BENCHMARK 攀岩馆</span>
            <span class="wm-t">${esc(title)}</span><span class="wm-cover"><img src="assets/mark.png" alt=""><em>${sh.kind === 'count' ? '点开领取' : '老带新，同一天来就免费'}</em></span>
            <span class="wm-f"><svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="#5b6bbf" stroke-width="2.5"/><path d="M8 12.5c0-2 1.6-3.5 3.5-3.5M16 11.5c0 2-1.6 3.5-3.5 3.5" stroke="#5b6bbf" stroke-width="2.5" fill="none"/></svg>小程序</span></button>`;
        }
        return `<div class="wx-msg ${mine ? 'me' : ''}">${mine ? '' : av}${inner}${mine ? av : ''}</div>`;
      };
      let lastT = '';
      const body = msgs.map(m => { const t = m.time !== lastT ? `<p class="wx-time">${m.time}</p>` : ''; lastT = m.time; return t + bubble(m); }).join('');
      return {
        top: 'wx', raw: `<div class="wx-nav"><button data-a="back" aria-label="返回">${icon('left', 22)}</button><b>${esc(o.name)}</b><span class="wx-more" aria-hidden="true">···</span></div>
          <div class="wx-body mp-body">${body}</div>
          <div class="wx-input" aria-hidden="true"><span class="wi-ic">◉</span><span class="wi-box"></span><span class="wi-ic">☺</span><span class="wi-ic">⊕</span></div>`,
        after(root) { const b = root.querySelector('.wx-body'); b.scrollTop = b.scrollHeight; },
      };
    },
  };

  // ---------- 弹层 ----------
  const insureBox = (u, extra = '') => `<div class="insure">
    <div class="ins-h">${icon('shield', 22)}<span><b>${INSURANCE.name}</b><small>${INSURANCE.insurer}</small></span><em>${u.policy ? '已生效' : '卡里含'}</em></div>
    <ul class="ins-cover">${INSURANCE.cover.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('')}<li><span>被保险人</span><b>${esc(u.name)}，${u.idNo}</b></li>${extra}</ul></div>`;
  const waiverText = label => `<details class="waiver"><summary>${label}</summary><ol>${WAIVER_POINTS.map(x => `<li>${x}</li>`).join('')}</ol></details>`;
  const sheetHead = t => `<div class="sheet-h"><span></span><b>${t}</b><button data-a="close" aria-label="关闭">${icon('close', 20)}</button></div>`;
  const SHEETS = {
    pay: (uid, s) => `<div class="pay"><div class="sheet-h"><button data-a="close" aria-label="关闭">${icon('close', 20)}</button><b></b><span></span></div>
      <p class="pay-merchant">BENCHMARK 攀岩馆</p><p class="pay-what">${esc(s.title)}</p>
      <div class="pay-amt"><small>¥</small>${s.amount.toFixed(2)}</div>
      <div class="pay-row"><span>付款方式</span><span>零钱 ${icon('right', 14)}</span></div>
      <button class="btn-wx" data-a="payConfirm">确认支付</button><p class="pay-note">原型演示，不会真的扣款</p></div>`,

    entry: (uid, s) => {
      const u = S.users[uid], buy = s.buy && product(s.buy), sign = !u.waiver;
      const total = buy ? buy.price : 0;
      const cards = buy
        ? `<div class="opt on"><span class="radio"></span><span><b>${esc(buy.name)} ${yuan(buy.price)}</b><small>今天有效，含租鞋和当日保险</small></span></div>`
        : s.opts.map(o => `<button class="opt ${s.sel === o.cardId ? 'on' : ''}" ${o.ok ? '' : 'disabled'} data-a="pickOpt" data-v="${o.cardId}">
          <span class="radio"></span><span><b>${esc(o.title)}</b><small>${esc(o.sub)}</small></span></button>`).join('');
      return `${sheetHead('确认入场')}
        <p class="ent-l">用哪张卡</p><div class="opts">${cards}</div>
        <p class="ent-l">当日保险</p>${insureBox(u)}
        ${sign ? `<button class="agree ${s.agree ? 'on' : ''}" data-a="agree" role="checkbox" aria-checked="${!!s.agree}"><span class="box">${s.agree ? icon('check', 14) : ''}</span><span>我已阅读并同意《攀岩运动风险告知书》</span></button>
          ${waiverText('看看告知书写了什么')}`
          : `<p class="ent-ok">${icon('check', 14)}《攀岩运动风险告知书》${fmtDot(u.waiver)} 已签过</p>`}
        <button class="btn primary block" data-a="confirmEntry" ${sign && !s.agree ? 'disabled' : ''}>${total ? `微信支付 ${yuan(total)} 并入场` : '确认入场'}</button>
        <p class="fine center">${sign ? '告知书和身份证号只在第一次填，以后扫码确认就能进，前台不用再签纸质单。' : '保险包含在你的卡里，不用另外付钱，入场后马上生效。'}</p>`;
    },

    docs: uid => {
      const u = S.users[uid], p = u.policy;
      return `${sheetHead('保险与告知书')}${insureBox(u, p ? `<li><span>保单号</span><b class="mono">${p.no}</b></li>` : '')}
        <p class="fine">${p ? `今天 ${p.time} 扫码入场时自动投保。` : '每次扫码入场时自动投保，当天有效。'}保费包含在卡里，不用另外付钱。</p>
        <ul class="kv panel"><li><span>风险告知书</span><b>${u.waiver ? `${fmtDot(u.waiver)} 已签` : '还没签，第一次入场时签'}</b></li></ul>
        ${waiverText('告知书内容')}`;
    },

    noCard: (uid, s) => {
      const blocked = s.opts.find(o => o.referral && !o.ok);
      return `${sheetHead(blocked ? '体验券还不能用' : '还没有能用的入场卡')}
        <p class="sheet-p">${blocked ? `老带新体验券要在邀请人到馆的当天使用。${esc(blocked.sub)}，之后你再扫一次就能进。` : '买一张卡就能马上入场。第一次来可以先买单次票，含攀岩鞋租借。'}</p>
        <div class="row stack"><button class="btn primary block" data-a="buySingleEnter">买单次票并入场（${yuan(product('s1').price)}）</button>
        ${blocked ? '<button class="btn block" data-a="close">我等等再扫</button>' : '<button class="btn block" data-a="goto" data-v="shop">看看其他卡</button>'}</div>`;
    },

    shareQty: (uid, s) => {
      const c = card(uid, s.cardId);
      return `${sheetHead('送给朋友')}<p class="sheet-p">从「${esc(c.name)}」里拿出几次送给朋友。朋友在微信里点开领取后，就能在 ${fmtDot(c.end)} 前扫码入场。</p>
        <div class="stepper"><button data-a="qty" data-v="-1" ${s.qty <= 1 ? 'disabled' : ''} aria-label="减少">${icon('minus', 20)}</button><b>${s.qty}<small>次</small></b><button data-a="qty" data-v="1" ${s.qty >= c.left ? 'disabled' : ''} aria-label="增加">${icon('plus', 20)}</button></div>
        <p class="fine center">送出后你的卡还剩 ${c.left - s.qty} 次</p>
        <button class="btn primary block" data-a="pickFriend">选择微信好友</button>`;
    },

    contacts: (uid, s) => {
      const o = S.users[other(uid)];
      if (s.to) {
        const isCount = s.payload.kind === 'count';
        const title = isCount ? `${S.users[uid].name} 送你 ${s.payload.qty} 次攀岩入场` : `${S.users[uid].name} 邀请你免费来爬一次`;
        return `${sheetHead('发送给')}<p class="send-to"><b>${esc(s.to)}</b></p>
          <div class="wx-mp preview"><span class="wm-h"><img src="assets/logo.jpg" alt="">BENCHMARK 攀岩馆</span><span class="wm-t">${esc(title)}</span>
          <span class="wm-cover"><img src="assets/mark.png" alt=""><em>${isCount ? '点开领取' : '老带新，同一天来就免费'}</em></span></div>
          <div class="row"><button class="btn block" data-a="contactBack">换一个人</button><button class="btn-wx block" data-a="send">发送</button></div>`;
      }
      const list = [[o.name, o.initial, o.tone, '演示用的另一部手机'], ['豆豆', '豆', 'volume', ''], ['阿伟', '伟', 'white', ''], ['周五爬墙小分队', '群', 'olive', '群聊，32 人']];
      return `${sheetHead('选择一个聊天')}<div class="contacts">${list.map(([n, i, t, note]) => `<button data-a="contact" data-v="${esc(n)}"><span class="wx-av tone-${t}">${i}</span><span><b>${esc(n)}</b>${note ? `<small>${note}</small>` : ''}</span></button>`).join('')}</div>`;
    },

    bookClass: (uid, s) => {
      const k = S.classes.find(x => x.id === s.classId), cc = lessonCard(uid, 'class');
      return `${sheetHead('预约团课')}<div class="panel co-sum"><span class="co-cat">${k.level}</span><b>${esc(k.name)}</b><p>${dayLabel(k.date)} ${k.start}–${k.end}，教练 ${esc(coach(k.coach).name)}</p></div>
        <div class="opts">${cc ? `<button class="opt ${s.pay === 'card' ? 'on' : ''}" data-a="payOpt" data-v="card"><span class="radio"></span><span><b>用团课次数</b><small>${esc(cc.name)}，剩 ${cc.left} 次</small></span></button>` : ''}
        <button class="opt ${s.pay === 'wx' ? 'on' : ''}" data-a="payOpt" data-v="wx"><span class="radio"></span><span><b>微信支付 ${yuan(CLASS_SINGLE_PRICE)}</b><small>单节购买</small></span></button></div>
        <p class="fine">开课前 2 小时可以免费取消，次数会退回。</p>
        <button class="btn primary block" data-a="confirmClass">确认预约</button>`;
    },

    cancelClass: (uid, s) => {
      const k = S.classes.find(x => x.id === s.classId);
      return `${sheetHead('取消预约？')}<p class="sheet-p">${esc(k.name)}，${dayLabel(k.date)} ${k.start}。取消后名额会让给候补的人，次数退回到你的卡里。</p>
        <div class="row"><button class="btn block" data-a="close">再想想</button><button class="btn block dark" data-a="cancelClass">取消预约</button></div>`;
    },

    bookPt: (uid, s) => {
      const c = coach(s.coachId), pc = lessonCard(uid, 'pt');
      return `${sheetHead('预约私教')}<div class="panel co-sum"><span class="co-cat">私教</span><b>${esc(c.name)}，60 分钟</b><p>${dayLabel(s.day)} ${pad(s.hour)}:00–${pad(s.hour + 1)}:00</p></div>
        <div class="opts">${pc ? `<button class="opt ${s.pay === 'card' ? 'on' : ''}" data-a="payOpt" data-v="card"><span class="radio"></span><span><b>用私教课时</b><small>${esc(pc.name)}，剩 ${pc.left} 节</small></span></button>` : ''}
        <button class="opt ${s.pay === 'wx' ? 'on' : ''}" data-a="payOpt" data-v="wx"><span class="radio"></span><span><b>微信支付 ${yuan(c.price)}</b><small>单节购买</small></span></button></div>
        <p class="fine">上课前 12 小时可以免费改约或取消。</p>
        <button class="btn primary block" data-a="confirmPt">确认预约</button>`;
    },

    joinEvent: (uid, s) => {
      const e = S.events.find(x => x.id === s.eventId), u = S.users[uid];
      return `${sheetHead('报名活动')}<div class="panel co-sum"><span class="co-cat">活动</span><b>${esc(e.title)}</b><p>${dayLabel(e.date)} ${e.start}–${e.end}</p></div>
        <ul class="kv panel"><li><span>报名人</span><b>${esc(u.name)}</b></li><li><span>手机号</span><b>${u.phone}</b></li><li><span>费用</span><b>${e.fee ? yuan(e.fee) : '免费'}</b></li></ul>
        <button class="btn primary block" data-a="confirmEvent">${e.fee ? `支付 ${yuan(e.fee)} 并报名` : '确认报名'}</button>`;
    },

    venue: () => `${sheetHead('场馆信息')}<ul class="kv panel"><li><span>营业时间</span><b>每天 10:00–23:00</b></li><li><span>地址</span><b>示意地址，正式版接入地图</b></li><li><span>前台电话</span><b>正式版填写</b></li></ul>
      <p class="fine">抱石区 A/B 两面墙，顶绳和先锋区 12 条绳道。可以租鞋和粉袋。</p>`,
  };

  // ---------- 流程 ----------
  function scanned(uid) {
    const u = S.users[uid];
    if (u.checkins.length) return replace(uid, { r: 'entered', id: u.checkins[0].id, again: true });
    const opts = entryOptions(uid), ok = opts.filter(o => o.ok);
    if (!ok.length) return sheet(uid, { type: 'noCard', opts });
    sheet(uid, { type: 'entry', opts, sel: ok[0].cardId });
  }
  function finishCheckin(uid, cardId) {
    const rec = doCheckin(uid, cardId);
    if (cur(uid).r === 'scan') replace(uid, { r: 'entered', id: rec.id }); else go(uid, { r: 'entered', id: rec.id });
    // 被邀请的朋友手机上提示：体验券今天可以用了
    Object.values(S.users).forEach(f => {
      if (f.id !== uid && f.cards.some(c => c.kind === 'referral' && c.from === uid && !c.used)) banner(f.id, { kind: 'mp', text: `${S.users[uid].name} 已到馆，你的老带新体验券今天可以用了` });
    });
    sync();
  }
  function afterPay(uid, then) {
    P[uid].sheet = null;
    if (then.type === 'product') { const c = buyProduct(uid, then.pid); replace(uid, { r: 'paid', cardId: c.id, pid: then.pid }); }
    else if (then.type === 'class') { bookClass(uid, then.classId, 'wx'); toast(uid, '预约成功'); }
    else if (then.type === 'pt') { bookPt(uid, then.coachId, then.day, then.hour, 'wx'); cur(uid).hour = null; toast(uid, '预约成功'); }
    else if (then.type === 'event') { joinEvent(uid, then.eventId); toast(uid, '报名成功'); }
    else if (then.type === 'enter') {
      const cardId = then.buy ? buyProduct(uid, then.buy).id : then.cardId;
      if (!S.users[uid].policy) buyInsurance(uid);
      return finishCheckin(uid, cardId);
    }
    sync();
  }
  function openWechat(uid) { S.unread[uid] = 0; P[uid].banner = null; if (cur(uid).r === 'wechat') render(uid); else go(uid, { r: 'wechat' }); }

  const ACT = {
    back: uid => back(uid),
    tab: (uid, v) => tab(uid, v),
    goto: (uid, v) => {
      const [r, seg, day] = v.split(':');
      if (r === 'courses') tab(uid, 'courses', { seg, day: +day || 0 });
      else if (['home', 'wallet', 'me'].includes(r)) tab(uid, r);
      else go(uid, { r, seg });
    },
    go: (uid, v) => go(uid, JSON.parse(v)),
    seg: (uid, v) => { const r = cur(uid); r.seg = v; r.day = 0; render(uid, true); },
    day: (uid, v) => { const r = cur(uid); r.day = +v; r.hour = null; render(uid); },
    slot: (uid, v) => { cur(uid).hour = +v; render(uid); },
    scan: uid => go(uid, { r: 'scan' }),
    scanNow: uid => scanned(uid),
    pickOpt: (uid, v) => { P[uid].sheet.sel = v; render(uid); },
    agree: uid => { P[uid].sheet.agree = !P[uid].sheet.agree; render(uid); },
    confirmEntry: uid => {
      const s = P[uid].sheet, buy = s.buy && product(s.buy);
      const then = { type: 'enter', cardId: s.sel, buy: s.buy };
      if (!buy) { P[uid].sheet = null; return afterPay(uid, then); }
      sheet(uid, { type: 'pay', amount: buy.price, title: buy.name, then });
    },
    checkout: (uid, v) => go(uid, { r: 'checkout', pid: v }),
    buy: (uid, v) => go(uid, { r: 'checkout', pid: v }),
    pay: uid => { const p = product(cur(uid).pid); sheet(uid, { type: 'pay', amount: p.price, title: p.name, then: { type: 'product', pid: p.id } }); },
    payConfirm: uid => afterPay(uid, P[uid].sheet.then),
    buySingleEnter: uid => sheet(uid, { type: 'entry', buy: 's1', opts: [] }),
    close: uid => closeSheet(uid),
    mask: uid => closeSheet(uid),
    shareCard: (uid, v) => sheet(uid, { type: 'shareQty', cardId: v, qty: 1 }),
    qty: (uid, v) => { const s = P[uid].sheet, c = card(uid, s.cardId); s.qty = Math.max(1, Math.min(c.left, s.qty + +v)); render(uid); },
    pickFriend: uid => { const s = P[uid].sheet; sheet(uid, { type: 'contacts', payload: { kind: 'count', cardId: s.cardId, qty: s.qty } }); },
    invite: uid => sheet(uid, { type: 'contacts', payload: { kind: 'referral' } }),
    contact: (uid, v) => { P[uid].sheet.to = v; render(uid); },
    contactBack: uid => { P[uid].sheet.to = null; render(uid); },
    send: uid => {
      const s = P[uid].sheet, sh = sendShare(uid, s.payload, s.to);
      P[uid].sheet = null;
      toast(uid, sh.toUid ? `已发送给 ${esc(s.to)}，去${esc(s.to)}的手机看看` : `已发送给 ${esc(s.to)}`, 2600);
      if (sh.toUid) banner(sh.toUid, { kind: 'chat', text: `${S.users[uid].name}：[小程序] ${sh.kind === 'count' ? `送你 ${sh.qty} 次攀岩入场` : '邀请你免费来爬一次'}` });
      sync();
    },
    openShare: (uid, v) => go(uid, { r: 'claim', shareId: v }),
    claim: uid => {
      const r = cur(uid), res = claimShare(uid, r.shareId);
      if (res.err) return toast(uid, res.err);
      r.done = true; render(uid, true); sync();
    },
    openBanner: uid => { const b = P[uid].banner; P[uid].banner = null; if (b.kind === 'chat') openWechat(uid); else tab(uid, 'wallet'); },
    bookClass: (uid, v) => sheet(uid, { type: 'bookClass', classId: v, pay: lessonCard(uid, 'class') ? 'card' : 'wx' }),
    payOpt: (uid, v) => { P[uid].sheet.pay = v; render(uid); },
    confirmClass: uid => {
      const s = P[uid].sheet, k = S.classes.find(x => x.id === s.classId);
      if (s.pay === 'card') { bookClass(uid, s.classId, 'card'); P[uid].sheet = null; toast(uid, '预约成功'); sync(); }
      else sheet(uid, { type: 'pay', amount: CLASS_SINGLE_PRICE, title: `团课：${k.name}`, then: { type: 'class', classId: k.id } });
    },
    cancelClassAsk: (uid, v) => sheet(uid, { type: 'cancelClass', classId: v }),
    cancelClass: uid => { cancelClass(uid, P[uid].sheet.classId); P[uid].sheet = null; toast(uid, '已取消，次数已退回'); sync(); },
    bookPt: uid => { const r = cur(uid); sheet(uid, { type: 'bookPt', coachId: r.id, day: dkey(addDays(TODAY, r.day || 0)), hour: r.hour, pay: lessonCard(uid, 'pt') ? 'card' : 'wx' }); },
    confirmPt: uid => {
      const s = P[uid].sheet, c = coach(s.coachId);
      if (s.pay === 'card') { bookPt(uid, s.coachId, s.day, s.hour, 'card'); P[uid].sheet = null; cur(uid).hour = null; toast(uid, '预约成功'); sync(); }
      else sheet(uid, { type: 'pay', amount: c.price, title: `私教：${c.name}`, then: { type: 'pt', coachId: s.coachId, day: s.day, hour: s.hour } });
    },
    joinEvent: (uid, v) => sheet(uid, { type: 'joinEvent', eventId: v }),
    confirmEvent: uid => {
      const e = S.events.find(x => x.id === P[uid].sheet.eventId);
      if (e.fee > 0) sheet(uid, { type: 'pay', amount: e.fee, title: `活动：${e.title}`, then: { type: 'event', eventId: e.id } });
      else { joinEvent(uid, e.id); P[uid].sheet = null; toast(uid, '报名成功'); sync(); }
    },
    venue: uid => sheet(uid, { type: 'venue' }),
    docs: uid => sheet(uid, { type: 'docs' }),
  };

  function bind(container) {
    container.addEventListener('click', e => {
      const el = e.target.closest('[data-a]');
      if (!el || el.disabled) return;
      const root = el.closest('[data-uid]');
      if (!root) return;
      if (el.dataset.a === 'mask' && e.target !== el) return;
      ACT[el.dataset.a]?.(root.dataset.uid, el.dataset.v, el, e);
    });
  }

  // 给演示路线用：把某部手机跳到指定页面
  function start(uid, route) { P[uid].stack = route.r === 'home' || TABS[route.r] ? [route] : [{ r: 'home' }, route]; P[uid].sheet = null; render(uid, true); }

  return { reset, render, renderAll: () => Object.keys(P).forEach(u => render(u)), bind, start, openWechat, P };
})();
