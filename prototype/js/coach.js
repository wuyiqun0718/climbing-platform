/* 教练端：同一个小程序，员工身份登录后多出来的「我的排班」。
 * 演示教练 Max 怎么快速占时段：点格子，或者说一句话（原型里用关键词识别，正式版交给大模型理解，写入前都要教练确认）。
 */

const Coach = (() => {
  const CID = 'max';
  const HOURS = Array.from({ length: 13 }, (_, i) => 10 + i); // 10:00–23:00
  let P;

  const keyOf = (day, h) => `${CID}|${dkey(addDays(TODAY, day))}|${h}`;
  const dayName = day => { const d = addDays(TODAY, day); return `${day === 0 ? '今天' : day === 1 ? '明天' : day === 2 ? '后天' : WEEK[d.getDay()]}（${fmtMD(d)}）`; };
  const hourWord = h => h < 12 ? `上午${h}点` : h === 12 ? '中午12点' : h < 18 ? `下午${h - 12}点` : `晚上${h - 12}点`;
  const span = hours => `${pad(hours[0])}:00–${pad(hours[hours.length - 1] + 1)}:00`;
  const nowH = () => new Date().getHours() + new Date().getMinutes() / 60;

  function reset() {
    if (P) { clearTimeout(P.tt); clearTimeout(P.bt); }
    // 已经看过的会员预约，之后小程序里新约的会弹提醒
    const seen = new Set(Object.keys(S.ptTaken).filter(k => k.startsWith(CID + '|')));
    P = { day: 0, sheet: null, toast: null, banner: null, text: '', seen };
  }
  function toast(text, ms = 2200) { P.toast = text; render(); clearTimeout(P.tt); P.tt = setTimeout(() => { P.toast = null; render(); }, ms); }
  function sheet(s) { P.sheet = s; render(); }

  // ---------- 说一句话 → 结构化的意图 ----------
  const CN = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  function num(s) {
    if (/^\d+$/.test(s)) return +s;
    if (s === '十') return 10;
    if (s.startsWith('十')) return 10 + CN[s[1]];
    if (s.endsWith('十')) return CN[s[0]] * 10;
    if (s.includes('十')) return CN[s[0]] * 10 + CN[s[2]];
    return CN[s];
  }
  const N = '(\\d{1,2}|[一二两三四五六七八九十]{1,3})';
  const PERIOD = '(上午|早上|中午|下午|晚上)?';
  function toHour(period, n) {
    if (period === '下午' || period === '晚上') return n < 12 ? n + 12 : n;
    if (period === '中午') return n <= 2 ? n + 12 : n;
    if (period === '上午' || period === '早上') return n;
    return n < 10 ? n + 12 : n; // 没说上午下午：岩馆 10 点开门，「3点」就是下午 3 点
  }

  function parse(raw) {
    const t = raw.replace(/\s+/g, '');
    const out = { raw, guessedDay: false };
    // 哪天
    let m;
    if (/今天|今晚/.test(t)) out.day = 0;
    else if (/明天|明晚/.test(t)) out.day = 1;
    else if (/后天/.test(t)) out.day = 2;
    else if ((m = t.match(/(下)?(?:周|星期|礼拜)([一二三四五六日天])/))) {
      const target = '日一二三四五六'.indexOf(m[2] === '天' ? '日' : m[2]), dow = TODAY.getDay();
      out.day = m[1] ? ((8 - dow) % 7 || 7) + (target + 6) % 7 : (target - dow + 7) % 7;
    } else if ((m = t.match(/(\d{1,2})[号日]/))) {
      const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), +m[1]);
      if (d < TODAY) d.setMonth(d.getMonth() + 1);
      out.day = Math.round((d - TODAY) / DAY);
    } else { out.day = P.day; out.guessedDay = true; }
    // 几点到几点
    m = t.match(new RegExp(`${PERIOD}${N}点半?(?:(?:到|至|-|~|—)${PERIOD}${N}点)?`));
    if (!m) return { ...out, err: '没听出是几点。可以这么说：「明天下午4点小王约了我」' };
    const start = toHour(m[1], num(m[2]));
    let end = m[4] ? toHour(m[3] || m[1], num(m[4])) : start + 1;
    if (end <= start) end = start + 1;
    out.hours = []; for (let h = start; h < end; h++) out.hours.push(h);
    if (out.hours.some(h => h < 10 || h > 22)) return { ...out, err: '营业时间是 10:00–23:00，这个时间不在里面' };
    // 做什么
    if (/取消|不约了|不上了|改天/.test(t)) out.action = 'cancel';
    else if (/不在|有事|请假|休息|不接|没空|占掉|别排/.test(t)) out.action = 'rest';
    else out.action = 'book';
    // 学员名字：「…小王约了我」或「小王…约了我」
    if (out.action === 'book') {
      m = t.match(/(?:点半?|天|晚|午|号|日)([^\d点天晚午号日，,。]{1,5}?)(?:约了我|约我|要约|预约了|约的)/)
        || t.match(/^([^\d今明后周下上中晚早星礼这]{1,5}?)(?:今天|明天|后天|今晚|明晚|下周|这周|周|星期|礼拜|上午|下午|晚上|中午|早上|\d)/);
      out.name = m ? m[1].replace(/^(?:的|和|跟)/, '') : '';
    }
    return out;
  }

  /** 每个小时现在是什么情况，用来判断冲突 */
  function check(intent) {
    return intent.hours.map(h => {
      const k = keyOf(intent.day, h), who = ptHolder(k);
      let problem = null;
      if (intent.action === 'cancel') {
        if (!who) problem = '这个时段本来就是空的';
        else if (who.kind === 'demo' || who.kind === 'base') problem = `这节是${who.name}在小程序里约的，要取消先跟学员说一声，再请前台在后台取消`;
      } else if (who) problem = who.kind === 'rest' ? '这个时段你已经标了有事' : `${who.name} 已经约了这个时段`;
      return { h, k, who, problem, offered: PT_HOURS.includes(h) };
    });
  }

  function apply(intent) {
    const rows = check(intent), d = parseKey(dkey(addDays(TODAY, intent.day)));
    rows.forEach(r => {
      if (intent.action === 'cancel') { delete S.ptTaken[r.k]; delete S.ptNotes[r.k]; return; }
      S.ptTaken[r.k] = intent.action === 'rest' ? 'rest' : 'desk';
      if (intent.action === 'book' && intent.name) S.ptNotes[r.k] = intent.name;
      P.seen.add(r.k);
    });
    const what = intent.action === 'cancel' ? '取消了' : intent.action === 'rest' ? '标了有事不接课：' : `填了线下约课${intent.name ? `（${intent.name}）` : ''}：`;
    pushFeed('admin', `教练 Max ${what}${fmtMD(d)} ${span(intent.hours)}`);
    P.day = intent.day; P.sheet = null; P.text = '';
    toast(intent.action === 'cancel' ? '取消了，这个时段又能约了' : '填好了，会员在小程序里看到这个时段已经约满');
    Mini.renderAll(); Main.onData();
  }

  // ---------- 页面 ----------
  function slotRow(day, h) {
    const k = keyOf(day, h), who = ptHolder(k), offered = PT_HOURS.includes(h);
    const past = day === 0 && h + 1 <= nowH();
    let cls, body, act = '';
    if (who) {
      cls = `bk-${who.kind}`;
      const sub = { base: '小程序约的', demo: '刚在小程序约的', desk: '线下约的，你填的', rest: '不接课' }[who.kind];
      body = `<b>${esc(who.name)}</b><small>${sub}</small>`;
      act = `data-c="slot" data-v="${h}"`;
    } else if (past) { cls = 'past'; body = '<small>已过</small>'; }
    else if (!offered) { cls = 'off'; body = '<small>不排课</small>'; }
    else { cls = 'free'; body = `<b>空闲</b><small>点一下占上</small>`; act = `data-c="slot" data-v="${h}"`; }
    const tag = act ? 'button' : 'div';
    return `<div class="cs-row"><time>${pad(h)}:00</time><${tag} class="cs-b ${cls}" ${act}>${body}</${tag}></div>`;
  }

  function page() {
    const day = P.day, c = coach(CID);
    const todayN = HOURS.filter(h => { const w = ptHolder(keyOf(0, h)); return w && w.kind !== 'rest'; }).length;
    const next = HOURS.map(h => ({ h, who: ptHolder(keyOf(0, h)) })).find(x => x.who && x.who.kind !== 'rest' && x.h >= Math.floor(nowH()));
    const strip = `<div class="days">${[0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = addDays(TODAY, i);
      return `<button class="${i === day ? 'on' : ''}" data-c="day" data-v="${i}"><small>${i === 0 ? '今天' : i === 1 ? '明天' : WEEK[d.getDay()]}</small><b>${d.getDate()}</b></button>`;
    }).join('')}</div>`;
    const dayN = HOURS.filter(h => { const w = ptHolder(keyOf(day, h)); return w && w.kind !== 'rest'; }).length;
    return `
      <div class="co-hero">${holdAvatar(c.ab, c.tone, 48, 0)}<div><b>Max 教练</b><small>今天 ${todayN} 节私教${next ? `，下一节 ${pad(next.h)}:00 ${esc(next.who.name)}` : ''}</small></div><span class="chip">员工</span></div>
      <div class="pad">${strip}
        <div class="sec-h flush"><h3>${dayName(day)}</h3><small>${dayN} 节</small></div>
        <div class="cs-list">${HOURS.map(h => slotRow(day, h)).join('')}</div>
        <p class="fine">会员在小程序里只能约「空闲」的时段。你在这里填的线下约课、有事不接课，会员那边会显示约满。</p>
      </div><div class="foot-space"></div>`;
  }

  function suggestions() {
    const free = (day, hs) => hs.every(h => !ptHolder(keyOf(day, h)));
    const t1 = PT_HOURS.filter(h => h >= 14).find(h => free(1, [h])) ?? 16;
    const r = [`明天${hourWord(t1)}小王约了我`];
    const pair = [[19, 20], [14, 15], [16, 17]].find(hs => free(2, hs)) || [19, 20];
    r.push(`后天${hourWord(pair[0])}到${pair[1] + 1 - (pair[1] + 1 > 12 ? 12 : 0)}点我有事`);
    const mine = Object.keys(S.ptTaken).filter(k => k.startsWith(CID + '|') && S.ptTaken[k] === 'desk').sort()[0];
    if (mine) {
      const [, d, h] = mine.split('|'), day = Math.round((parseKey(d) - TODAY) / DAY);
      r.push(`取消${day === 0 ? '今天' : day === 1 ? '明天' : day === 2 ? '后天' : WEEK[parseKey(d).getDay()]}${hourWord(+h)}的课`);
    } else r.push('周六上午10点阿凯约了我');
    return r;
  }

  function footer() {
    return `<div class="say">
      <div class="say-chips">${suggestions().map(s => `<button data-c="say" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <form class="say-row" data-c="form"><button type="button" class="say-mic" data-c="mic" aria-label="语音输入">${icon('mic', 20)}</button>
        <input id="coach-say" type="text" value="${esc(P.text)}" placeholder="说一句，比如：明天下午4点小王约了我" aria-label="说一句话来填时段" autocomplete="off">
        <button type="submit" class="btn sm primary">发送</button></form></div>`;
  }

  // ---------- 弹层 ----------
  const head = t => `<div class="sheet-h"><span></span><b>${t}</b><button data-c="close" aria-label="关闭">${icon('close', 20)}</button></div>`;
  const SHEETS = {
    intent(s) {
      const it = s.intent;
      if (it.err) return `${head('没听明白')}<p class="heard">「${esc(it.raw)}」</p><p class="sheet-p">${esc(it.err)}</p>
        <button class="btn block" data-c="close">好，我再说一次</button>`;
      const rows = check(it), bad = rows.filter(r => r.problem), d = addDays(TODAY, it.day);
      const label = { book: '线下约课', rest: '有事不接课', cancel: '取消' }[it.action];
      const extra = rows.filter(r => !r.problem && !r.offered && it.action !== 'cancel');
      return `${head('我理解的是')}
        <p class="heard">「${esc(it.raw)}」</p>
        <ul class="kv panel">
          <li><span>要做什么</span><b><span class="chip ${it.action === 'cancel' ? 'warn' : 'olive'}">${label}</span></b></li>
          <li><span>哪天</span><b>${it.day === 0 ? '今天' : it.day === 1 ? '明天' : it.day === 2 ? '后天' : ''} ${fmtMD(d)} ${WEEK[d.getDay()]}${it.guessedDay ? '<small class="guess">没说哪天，按你正在看的这天</small>' : ''}</b></li>
          <li><span>时间</span><b>${span(it.hours)}</b></li>
          ${it.action === 'book' ? `<li><span>学员</span><b>${it.name ? esc(it.name) : '<small class="guess">没听出名字，先不写</small>'}</b></li>` : ''}
        </ul>
        ${bad.length ? `<div class="say-warn">${icon('info', 16)}<div>${bad.map(r => `<p><b>${pad(r.h)}:00</b> ${esc(r.problem)}</p>`).join('')}</div></div>` : ''}
        ${extra.length ? `<p class="fine">${extra.map(r => `${pad(r.h)}:00`).join('、')} 平时不排私教，确认后照样给你填上。</p>` : ''}
        <div class="row"><button class="btn block" data-c="manual">不对，我自己选</button>
          <button class="btn primary block" data-c="confirm" ${bad.length ? 'disabled' : ''}>${it.action === 'cancel' ? '对，取消' : '对，填上'}</button></div>
        <p class="fine center">原型里用关键词识别；正式版由大模型理解这句话，写进系统前一样要你点确认。</p>`;
    },
    slot(s) {
      const k = keyOf(P.day, s.h), who = ptHolder(k), when = `${dayName(P.day)} ${pad(s.h)}:00–${pad(s.h + 1)}:00`;
      if (!who) return `${head('占上这个时段')}<p class="sheet-p">${when}</p>
        <div class="opts"><button class="opt ${s.kind === 'book' ? 'on' : ''}" data-c="slotKind" data-v="book"><span class="radio"></span><span><b>线下约的学员</b><small>学员在微信上找你约的</small></span></button>
          ${s.kind === 'book' ? `<input class="say-name" id="coach-name" type="text" value="${esc(s.name || '')}" placeholder="学员名字（可以不填）" aria-label="学员名字">` : ''}
          <button class="opt ${s.kind === 'rest' ? 'on' : ''}" data-c="slotKind" data-v="rest"><span class="radio"></span><span><b>我有事，不接课</b><small>会员那边显示约满</small></span></button></div>
        <button class="btn primary block" data-c="slotSave">占上</button>`;
      if (who.kind === 'desk' || who.kind === 'rest') return `${head(who.kind === 'rest' ? '有事不接课' : '线下约课')}<p class="sheet-p">${when}${who.kind === 'desk' ? `，学员：${esc(who.name)}` : ''}</p>
        <div class="row"><button class="btn block" data-c="close">留着</button><button class="btn block dark" data-c="slotFree">改回空闲</button></div>`;
      return `${head('学员约的课')}<p class="sheet-p">${when}</p>
        <ul class="kv panel"><li><span>学员</span><b>${esc(who.name)}</b></li><li><span>怎么约的</span><b>小程序</b></li></ul>
        <p class="fine">会员自己约的课，改约或取消要先跟学员说一声，再请前台在后台操作，系统会通知学员。</p>
        <button class="btn block" data-c="close">知道了</button>`;
    },
  };

  // ---------- 外壳 ----------
  function render() {
    const root = document.getElementById('phone-coach');
    if (!root || !P) return;
    const prev = root.querySelector('.mp-body'), scroll = prev ? prev.scrollTop : 0;
    const focused = document.activeElement?.id;
    root.dataset.top = 'light';
    root.innerHTML = Mini.statusBar()
      + `<div class="mp-nav"><div class="nav-l"></div><div class="nav-t">我的排班</div><div class="nav-r">${Mini.capsule()}</div></div>`
      + `<div class="mp-body">${page()}</div>`
      + `<div class="mp-footer coach-ft">${footer()}</div>`
      + (P.sheet ? `<div class="sheet-mask" data-c="mask"><div class="sheet" role="dialog">${SHEETS[P.sheet.type](P.sheet)}</div></div>` : '')
      + (P.toast ? `<div class="mp-toast" role="status">${P.toast}</div>` : '')
      + (P.banner ? `<button class="wx-banner" data-c="banner"><span class="wb-app mp"><img src="assets/logo.jpg" alt=""></span><span class="wb-text"><b>BENCHMARK 攀岩馆</b><span>${esc(P.banner.text)}</span></span><small>现在</small></button>` : '');
    root.querySelector('.mp-body').scrollTop = scroll;
    if (focused === 'coach-say' || focused === 'coach-name') { const el = document.getElementById(focused); el?.focus(); el?.setSelectionRange?.(el.value.length, el.value.length); }
  }

  /** 小程序里有会员约了 Max：教练手机上弹一条提醒 */
  function onData() {
    if (!P) return;
    const fresh = Object.keys(S.ptTaken).filter(k => k.startsWith(CID + '|') && !P.seen.has(k));
    fresh.forEach(k => P.seen.add(k));
    const k = fresh.find(x => ptHolder(x)?.kind === 'demo');
    if (k) {
      const [, d, h] = k.split('|');
      P.banner = { text: `${ptHolder(k).name} 约了你 ${fmtMD(parseKey(d))} ${pad(+h)}:00 的私教`, day: Math.round((parseKey(d) - TODAY) / DAY) };
      clearTimeout(P.bt); P.bt = setTimeout(() => { P.banner = null; render(); }, 8000);
    }
    render();
  }

  function say(text) {
    P.text = text;
    if (!text.trim()) return;
    sheet({ type: 'intent', intent: parse(text.trim()) });
  }

  const ACT = {
    day: v => { P.day = +v; render(); root().querySelector('.mp-body').scrollTop = 0; },
    slot: v => sheet({ type: 'slot', h: +v, kind: 'book' }),
    slotKind: v => { P.sheet.name = document.getElementById('coach-name')?.value ?? P.sheet.name; P.sheet.kind = v; render(); },
    slotSave: () => {
      const s = P.sheet, name = (document.getElementById('coach-name')?.value || '').trim();
      apply({ action: s.kind, day: P.day, hours: [s.h], name });
    },
    slotFree: () => apply({ action: 'cancel', day: P.day, hours: [P.sheet.h] }),
    say: v => say(v),
    mic: () => toast('正式版直接用微信键盘上的语音输入，说完会变成文字。原型里点上面的例句试试', 3000),
    confirm: () => apply(P.sheet.intent),
    manual: () => { P.day = P.sheet.intent.day ?? P.day; P.sheet = null; toast('在下面点空闲的格子就能占上'); },
    close: () => { P.sheet = null; render(); },
    mask: () => { P.sheet = null; render(); },
    banner: () => { P.day = P.banner.day; P.banner = null; render(); },
  };
  const root = () => document.getElementById('phone-coach');

  function bind() {
    const el = root();
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-c]');
      if (!t || t.disabled || t.dataset.c === 'form') return;
      if (t.dataset.c === 'mask' && e.target !== t) return;
      ACT[t.dataset.c]?.(t.dataset.v);
    });
    el.addEventListener('submit', e => { e.preventDefault(); say(document.getElementById('coach-say').value); });
    el.addEventListener('input', e => { if (e.target.id === 'coach-say') P.text = e.target.value; });
  }

  return { reset, render, onData, bind, parse, start: (day = 0) => { P.day = day; P.sheet = null; render(); } };
})();
