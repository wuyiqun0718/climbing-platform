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
      steps: ['点首页的「扫码入场」', '两秒后自动识别前台码，也可以点按钮', '选年卡入场，不扣次数；当日保险包含在卡里自动投，告知书以前签过不用再签'],
      start: () => { Mini.start('jie', { r: 'home' }); show('jie'); },
    },
    {
      title: '入场自动投当日保险', who: '小鹿',
      steps: ['小鹿点首页的「扫码入场」，还没有卡，选「买单次票并入场」', '确认页里写着当日保险「卡里含」，勾选同意《攀岩运动风险告知书》', '只付单次票的钱，保险自动投好，前台不用再签纸质单', '入场页和「我的 → 保险与告知书」里能看到保单；后台「入场与分享」显示已投保'],
      start: () => { Mini.start('lu', { r: 'home' }); show('lu'); },
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
      steps: ['在「约课」里切换团课、私教、活动', '团课和私教都能用课时抵扣，也能单节付款', '预约过的课在「我的 → 我的预约」里', '切到后台「课程排期 → 私教」，时间轴上能看到每位教练哪天哪个时段有课，刚约的那节有黑框'],
      start: () => { Mini.start('jie', { r: 'courses', seg: 'pt' }); show('jie'); },
    },
    {
      title: '教练说一句话就占好时段', who: '教练 Max', coach: true,
      steps: ['切到「教练端」，右边是教练 Max 的手机：同一个小程序，员工登录后多出「我的排班」', '点下面的例句「明天下午…小王约了我」，确认卡片上写着它听懂的日期、时间、学员', '点「对，填上」，排班里多了一格线下约课；阿杰的手机里这个时段已经约满', '也可以直接点空闲的格子，选「线下约的学员」或「我有事，不接课」'],
      start: () => { setMode('coach'); Coach.start(1); Mini.start('jie', { r: 'coach', id: 'max', day: 1 }); show('coach'); },
    },
    {
      title: '会员约私教，教练马上知道', who: '阿杰和教练 Max', coach: true,
      steps: ['切到「教练端」，阿杰在左边的手机上约 Max 的私教', '选一个时间，用私教课时预约', '右边 Max 的手机弹出提醒，点一下就跳到那一天的排班'],
      start: () => { setMode('coach'); Coach.start(0); Mini.start('jie', { r: 'coach', id: 'max' }); show('jie'); },
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
    {
      title: '用中文问数据', who: '管理后台',
      steps: ['切到管理后台，点右下角「问数据」', '问「上个月哪个活动的新客占比最高？」，先选「新客」的口径', '展开「查询过程」，看它查了哪些数据', '再问「过去六个月哪一批定线的探馆频率最高？」'],
      start: () => { setMode('admin'); Admin.go('dash'); Ask.open(); },
    },
  ];

  function renderRoutes() {
    document.getElementById('routes').innerHTML = ROUTES.map((r, i) => `<details class="route" ${i === 3 ? 'open' : ''}>
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
    const c = coach('max'), el = document.querySelector('[data-label="coach"]');
    if (el) el.innerHTML = `<span class="who">${holdAvatar(c.ab, c.tone, 34, 0)}<span><b>教练 ${c.name}</b><small>员工身份登录同一个小程序</small></span></span>`;
  }

  function show(uid) {
    focus = uid;
    document.querySelectorAll('[data-focus]').forEach(b => b.setAttribute('aria-selected', b.dataset.focus === uid));
    document.querySelectorAll('.phone-col').forEach(c => c.classList.toggle('focus', c.dataset.col === uid));
    document.querySelector('[data-focus="coach"] .dot').classList.remove('on');
    if (narrow.matches) document.getElementById('phones').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 教练端：左边还是会员阿杰，右边换成教练 Max；小鹿的手机先收起来
  const GUIDE = {
    mini: ['两部手机，一套数据', '左边是年卡会员阿杰，右边是第一次来的小鹿。次卡分享和老带新都能在两部手机之间真的走一遍，每一步也会同步到管理后台。'],
    coach: ['教练端', '还是同一个小程序，教练用员工身份登录后多出「我的排班」。左边是会员阿杰，右边是教练 Max：会员约课教练马上知道，教练点一下或说一句话就能占好时段。'],
  };
  function setMode(m) {
    mode = m;
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === m));
    document.getElementById('mini').hidden = m === 'admin';
    document.getElementById('admin').hidden = m !== 'admin';
    if (m !== 'admin') {
      const coach = m === 'coach';
      document.querySelector('[data-col="lu"]').hidden = coach;
      document.querySelector('[data-col="coach"]').hidden = !coach;
      document.querySelector('[data-focus="lu"]').hidden = coach;
      document.querySelector('[data-focus="coach"]').hidden = !coach;
      [document.getElementById('guide-title').textContent, document.getElementById('guide-lede').textContent] = GUIDE[m];
      if (coach && focus === 'lu') show('coach');
      if (!coach && focus === 'coach') show('jie');
    }
    Ask.setMode(m === 'admin' ? 'admin' : 'mini');
    if (m === 'admin') Admin.render(); else { Mini.renderAll(); Coach.render(); }
    scrollTo(0, 0);
  }

  function onData() {
    if (mode === 'admin') Admin.render();
    Coach.onData();
    if (mode === 'coach' && focus !== 'coach') document.querySelector('[data-focus="coach"] .dot').classList.add('on');
    updateLabels();
  }

  function init() {
    renderRoutes();
    Mini.reset();
    Coach.reset();
    Coach.bind();
    Mini.bind(document.getElementById('phones'));
    Admin.bind(document.getElementById('admin'));
    Ask.init();
    Mini.renderAll();
    Coach.render();
    show('jie');

    document.querySelector('.mode-switch').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
    document.getElementById('routes').addEventListener('click', e => { const b = e.target.closest('[data-route]'); if (!b) return; const r = ROUTES[+b.dataset.route]; if (mode === 'coach' && !r.coach) setMode('mini'); r.start(); });
    document.getElementById('phones').addEventListener('click', e => {
      const w = e.target.closest('[data-wx]'); if (w) { Mini.openWechat(w.dataset.wx); show(w.dataset.wx); }
      const f = e.target.closest('[data-focus]'); if (f) show(f.dataset.focus);
    });
    document.getElementById('reset').addEventListener('click', () => {
      S = seedState(); Mini.reset(); Coach.reset(); Admin.reset(); Ask.reset(); updateLabels(); setMode(mode); show('jie');
    });
    let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (mode === 'admin') Admin.drawCharts(); }, 150); });
    // 状态栏时间每分钟走一次
    setInterval(() => document.querySelectorAll('.sb > span:first-child').forEach(s => s.textContent = nowHM()), 30000);
  }

  return { init, updateLabels, onData, show, setMode, get focus() { return focus; } };
})();

Main.init();
