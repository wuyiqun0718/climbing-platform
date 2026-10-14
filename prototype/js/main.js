/* 页面外壳：模式切换、演示路线、窄屏下的手机切换 */

const Main = (() => {
  let mode = 'mini', focus = 'jie';
  const narrow = matchMedia('(max-width: 900px)');

  const ROUTES = [
    {
      title: '买一张次卡', who: '小鹿',
      steps: ['在「购卡」里切到「次卡」，选 10 次卡', '确认订单，点「微信支付」再确认', '卡出现在卡包里，后台财务多了一笔订单'],
      start: () => { Mini.start('lu', { r: 'shop', seg: 'count' }); show('lu'); },
    },
    {
      title: '扫码入场', who: '阿杰',
      steps: ['点首页的「扫码入场」', '两秒后自动识别前台码，也可以点按钮', '选年卡入场，不扣次数'],
      start: () => { Mini.start('jie', { r: 'home' }); show('jie'); },
    },
    {
      title: '把次卡送给朋友', who: '阿杰和小鹿',
      steps: ['阿杰在「卡包」的 10 次卡上点「送给朋友」', '选次数，选微信好友小鹿，发送', '小鹿收到微信消息，点开小程序卡片领取', '小鹿用这张次卡扫码入场'],
      start: () => { Mini.start('jie', { r: 'wallet' }); Mini.start('lu', { r: 'home' }); show('jie'); },
    },
    {
      title: '老带新', who: '阿杰和小鹿',
      steps: ['阿杰在首页点「老带新」，把邀请发给小鹿', '小鹿点开卡片，领取体验券', '小鹿先扫码，会提示要等阿杰入场', '阿杰扫码入场后，小鹿再扫就能免费进'],
      start: () => { Mini.start('jie', { r: 'referral' }); Mini.start('lu', { r: 'home' }); show('jie'); },
    },
    {
      title: '约私教、团课，报名活动', who: '阿杰',
      steps: ['在「约课」里切换团课、私教、活动', '团课和私教都能用课时抵扣，也能单节付款', '预约过的课在「我的 → 我的预约」里'],
      start: () => { Mini.start('jie', { r: 'courses', seg: 'pt' }); show('jie'); },
    },
    {
      title: '在后台发布课程', who: '管理后台',
      steps: ['切到管理后台，看刚才的订单、入场和分享', '在「课程排期」点「发布团课」', '回到小程序「约课」，新课已经在课表里'],
      start: () => { setMode('admin'); Admin.go('courses'); },
    },
    {
      title: '看每批新线带来多少客流', who: '管理后台',
      steps: ['切到管理后台，打开「定线分析」', '对比三个分馆当前这批线的热度，看哪个馆该换线了', '在表格里点一批线，看它的热度曲线和净提升', '点「登记换线」，回到小程序首页看新线预告'],
      start: () => { setMode('admin'); Admin.go('routes'); },
    },
  ];

  function renderRoutes() {
    document.getElementById('routes').innerHTML = ROUTES.map((r, i) => `<details class="route" ${i === 2 ? 'open' : ''}>
      <summary><span class="r-t">${r.title}</span><span class="r-who">${r.who}</span></summary>
      <ol>${r.steps.map(s => `<li>${s}</li>`).join('')}</ol>
      <button class="btn sm dark" data-route="${i}">从这里开始</button></details>`).join('');
  }

  function updateLabels() {
    ['jie', 'lu'].forEach(uid => {
      const u = S.users[uid], el = document.querySelector(`[data-label="${uid}"]`);
      if (!el) return;
      const n = S.unread[uid];
      el.innerHTML = `<span class="who">${holdAvatar(u.initial, u.tone, 34, uid === 'jie' ? 0 : 1)}<span><b>${u.name}</b><small>${uid === 'jie' ? '年卡会员，有次卡和课时' : '第一次来，什么卡都没有'}</small></span></span>
        <button class="wx-open" data-wx="${uid}" aria-label="打开${u.name}的微信聊天${n ? `，${n} 条未读` : ''}">${icon('chat', 16)}微信${n ? `<em>${n}</em>` : ''}</button>`;
      document.querySelector(`[data-focus="${uid}"] .dot`).classList.toggle('on', n > 0);
    });
  }

  function show(uid) {
    focus = uid;
    document.querySelectorAll('[data-focus]').forEach(b => b.setAttribute('aria-selected', b.dataset.focus === uid));
    document.querySelectorAll('.phone-col').forEach(c => c.classList.toggle('focus', c.dataset.col === uid));
    if (narrow.matches) document.getElementById('phones').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === m));
    document.getElementById('mini').hidden = m !== 'mini';
    document.getElementById('admin').hidden = m !== 'admin';
    if (m === 'admin') Admin.render(); else Mini.renderAll();
    scrollTo(0, 0);
  }

  function onData() { if (mode === 'admin') Admin.render(); updateLabels(); }

  function init() {
    renderRoutes();
    Mini.reset();
    Mini.bind(document.getElementById('phones'));
    Admin.bind(document.getElementById('admin'));
    Mini.renderAll();
    show('jie');

    document.querySelector('.mode-switch').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
    document.getElementById('routes').addEventListener('click', e => { const b = e.target.closest('[data-route]'); if (b) ROUTES[+b.dataset.route].start(); });
    document.getElementById('phones').addEventListener('click', e => {
      const w = e.target.closest('[data-wx]'); if (w) { Mini.openWechat(w.dataset.wx); show(w.dataset.wx); }
      const f = e.target.closest('[data-focus]'); if (f) show(f.dataset.focus);
    });
    document.getElementById('reset').addEventListener('click', () => {
      S = seedState(); Mini.reset(); Admin.reset(); updateLabels(); setMode(mode); show('jie');
    });
    let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (mode === 'admin') Admin.drawCharts(); }, 150); });
    // 状态栏时间每分钟走一次
    setInterval(() => document.querySelectorAll('.sb > span:first-child').forEach(s => s.textContent = nowHM()), 30000);
  }

  return { init, updateLabels, onData, show, setMode, get focus() { return focus; } };
})();

Main.init();
