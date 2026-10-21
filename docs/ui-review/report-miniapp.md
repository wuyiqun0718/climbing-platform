# 会员小程序 H5 UI 验收

视口 390×844（截图是 2 倍图，780×1688）。日期 2026-10-22。H5 截图在 `docs/ui-review/before/`，原型截图在 `docs/ui-review/prototype/`。对照的是 `apps/miniapp` 已实现页面和 `prototype/` 里对应的会员端画面。

颜色只用主题变量（`gyms/benchmark` 经 `@climb/theme` 的 `toCssVars` 挂上）：`--brand` `#86972f`、`--on-brand` `#000`、`--ink`、`--ink-muted`、`--accent`、`--neutral`、`--surface`、`--page`、`--font-display`、`--font-number`、`--radius-sm/md/lg`、`--stroke`。小程序组件按 `.vue` 路径引入，例如 `import Button from '@climb/ui-mp/Button.vue'`（`packages/ui-mp` 的 exports 是 `./*.vue` → `./src/*.vue`）。业务能不能入场、扣次、能不能领，仍只放在 `@climb/core`，页面只展示接口已经算好的结果。

## 统计

| 严重程度 | 数量 |
| --- | --- |
| 高 | 7 |
| 中 | 12 |
| 低 | 6 |
| 合计 | 25 |

## 这次不要做

- 不要新做私教预约页、活动页、教练语音输入。首页「私教」「活动」和卡包私教「去约课」保持进不了页面，只改文案和不可用样式。
- 不要把「约课」加进 `pages.base.json` 的 tabBar。现在是首页进团课，三个 tab 是首页 / 卡包 / 我的。
- 不要写死划线价、「最划算」、「省 ¥198」。`Product`（`packages/core/src/types.ts`）没有原价和角标字段。
- 不要写死保险保额。`InsurancePolicy` 没有保额字段，确认入场保持现在一行「入场当日保险」。
- 不要改 `@climb/core` 的规则来迁就界面。
- 结算页底栏、卡包滚到底的「+ 购买新卡」，在 390 宽下没有被 tab 挡住，不用改定位。标题字体是 ZCOOL QingKe HuangYou，数字是 Bricolage Grotesque，已经加载上了。

## 高

### H1. 卡包的「入场」「去约课」还在弹「任务 xx 还在做」

- 页面/路由：`pages/cards/index`（tab）
- 截图：`before/cards-toast-scan.png`（次卡「入场」）、`before/cards-toast-class.png`（私教卡「去约课」）。团课卡的「去约课」同一次点击没有单独截到，它走的是下面同一个分支。
- 问题：按钮能点，但 toast 盖住卡面数字和「前有效」。文案是「扫码入场（任务 18）还在做」「私教（任务 33）还在做」。扫码和团课页面已经有了。toast 又窄又长，任务号会折行，压在卡号上。
- 文件：`apps/miniapp/src/pages/cards/index.vue` 的 `SOON` 和 `open()`。按钮的 key 来自 `apps/miniapp/src/lib/card-view.ts`：入场是 `scan`，团课是 `classes`，私教是 `pt`。
- 改法：删掉 `SOON`。`open()` 在现有 `ledger` / `share` / `shop` 之后加：
  - `scan`：`import { startScan } from '../checkin/start-scan'`，调用 `startScan()`。和首页扫码同一条路。
  - `classes`：`uni.navigateTo({ url: '/pages/classes/index' })`。
  - `pt`：`uni.showToast({ title: '私教预约还没开放', icon: 'none' })`。不要出现任务编号。
  - 其余未知 key 用「这个入口还没开放」，同样不要任务编号。
- **已修**：after 图：`after/cards-toast-scan.png`（次卡「入场」弹出模拟扫码）、`after/cards-toast-class.png`（私教卡「去约课」toast「私教预约还没开放」）。团课卡「去约课」直接进团课页。

### H2. 首页把未做功能写成开发备注

- 页面/路由：`pages/index/index`（tab）
- 截图：`before/home-toast-pt.png`、`before/home-toast-events.png`、`before/home-ajie.png`（「近期活动」白盒子）
- 问题：点「私教」toast「私教（任务 33）还在做」，点「活动」toast「活动（任务 36）还在做」，toast 压在老带新横条上。「近期活动」盒子里写着「活动报名还在做。」会员能看到任务号和「还在做」。
- 文件：`apps/miniapp/src/pages/index/index.vue` 的 `SOON`、`open()`，以及模板里 `gym.features.events` 那段占位（约第 178–185 行）。
- 改法：删掉 `SOON`。`pt` 和 `events` 的 toast 改成「私教预约还没开放」「活动报名还没开放」。占位盒子的文案改成「最近没有活动。」，样式跟下面空状态组件一致（见 M7）：13px、`color: var(--ink-muted)`、放在现有 `.panel` 里。快捷入口在页面没做之前加 `opacity: 0.45`，仍可点出这句短 toast。不要删 `gym.features.events` 的判断。
- **已修**：after 图：`after/home-toast-pt.png`、`after/home-toast-events.png`、`after/home-ajie.png`

### H3. 品牌绿上的次要文字发灰

- 页面/路由：`pages/checkin/confirm`、`pages/checkin/done`
- 截图：`before/checkin-confirm-ajie.png`、`before/checkin-confirm-xiaolu.png`、`before/checkin-confirm-reentry.png`、`before/checkin-done-ajie.png`、`before/checkin-done-reentry.png`。原型对照：`prototype/checkin-confirm-ajie.png`（选中卡的副文案是深色）。
- 问题：选中的入场方式是 `--brand` 底，副文案「2027.03.26 到期，不扣次」「今天有效，含当日保险」用的是 `--ink-muted`（`#6e6e66`），橄榄底上发灰。入场成功绿条上的「滨港店 · 2026-10-22」同样发灰。`MemberCard` 已经处理过同类问题：`.tone-brand .meta { color: var(--ink); opacity: 0.75; }`。
- 文件：
  - `apps/miniapp/src/pages/checkin/confirm.vue`：`.opt.on { background: var(--brand); }`，`.small { color: var(--ink-muted); }`
  - `apps/miniapp/src/pages/checkin/done.vue`：`.hero { background: var(--brand); }`，`.p { color: var(--ink-muted); }`。`.p` 在白底面板里也用，不能把所有 `.p` 改成深色。
- 改法：
  - confirm：加 `.opt.on .small { color: var(--on-brand); opacity: 0.75; }`。未选中的 `.small` 继续 `--ink-muted`。
  - done：加 `.hero .p { color: var(--on-brand); opacity: 0.75; }`。白底面板上的 `.p` 保持 `--ink-muted`。
  - 以后凡是 `background: var(--brand)` 或 `var(--accent)` 或 `var(--neutral)` 上的说明文字，用 `color: var(--on-brand)` 加 `opacity: 0.75`，不要用 `--ink-muted`。
- **已修**：after 图：`after/checkin-confirm-ajie.png`、`after/checkin-confirm-xiaolu.png`、`after/checkin-confirm-reentry.png`、`after/checkin-done-ajie.png`、`after/checkin-done-reentry.png`

### H4. 告知书没勾选时，主按钮仍是实心品牌绿

- 页面/路由：`pages/checkin/confirm`（小鹿，未签告知书）
- 截图：`before/checkin-confirm-xiaolu.png`、`before/checkin-waiver-expanded.png`
- 问题：按钮有 `:disabled="!canSubmit || submitting"`（`confirm.vue` 约第 207 行），样式里没有禁用态。没勾选时「微信支付 ¥108 并入场」和可点时一样绿。各页各自复制了一套 `.btn`，禁用态补一处不够。
- 文件：新建 `packages/ui-mp/src/Button.vue`。先改 `confirm.vue` 的主按钮，再把下面这些页面里的本地 `.btn` 换成这个组件（类名和现有视觉对齐，不要改文案和点击逻辑）：
  - `pages/index/index.vue`
  - `pages/cards/index.vue`、`pages/cards/detail.vue`
  - `pages/shop/index.vue`、`pages/shop/checkout.vue`
  - `pages/me/orders.vue`、`pages/classes/index.vue`
  - `pages/share/count.vue`、`pages/share/referral.vue`、`pages/share/claim.vue`
  - `pages/checkin/confirm.vue`、`pages/checkin/done.vue`
  - `pages/login/index.vue`
- 改法：组件对外 `variant: 'primary' | 'dark' | 'ghost'`、`disabled`、`block`、`mini`。模板仍用 `<button>`，同时绑 `:disabled` 和 class `is-disabled`。uni-h5 里 `disabled` 属性可能落在内部 button 上，只写 `.btn[disabled]` 会不生效，所以样式写在宿主 class 上：

```css
.btn {
  margin: 0;
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
}
.btn.block { width: 100%; }
.btn.mini { font-size: 13px; }
.btn.primary { background: var(--brand); color: var(--on-brand); }
.btn.dark { background: var(--ink); color: var(--surface); }
.btn.is-disabled { opacity: 0.45; }
```

确认页主按钮：`<Button variant="primary" block :disabled="!canSubmit || submitting">`。
- **已修**：after 图：`after/checkin-confirm-xiaolu.png`、`after/checkin-waiver-expanded.png`。`packages/ui-mp/src/Button.vue` 已替换列表里所有页面的本地 `.btn`；没照抄 `line-height: 1.2`，保留 uni 按钮默认行高，否则按钮会变矮。另加了 `openType` 和 `getphonenumber` 透传给登录、分享按钮用。

### H5. 扫码图标是「井」，快捷入口是单字

- 页面/路由：`pages/index/index`
- 截图：`before/home-ajie.png`、`before/home-xiaolu.png`。原型：`prototype/home-ajie.png`
- 问题：`.scan-ic` 里是字符 `⌗`（U+2317），PingFang 里没有这个字，画成「井」。四个快捷入口用 `q.label.slice(0, 1)`，变成「购 / 团 / 私 / 活」。原型是扫描框图标和四个图形图标，底色分别是米色、灰、品牌绿、白。
- 文件：`apps/miniapp/src/pages/index/index.vue` 模板约第 115–131 行。现有 class：`.scan-ic`、`.q-ic`、`.tone-*`。
- 改法：去掉字符。`.scan-ic` 里放一个 22×22 的内联 SVG 扫描框（四角框加中间一横），`fill: none`，`stroke: currentColor`，`stroke-width: 2`。颜色继承按钮上的 `--on-brand` / `--ink`，不要写死 hex。四个入口同样用 SVG（卡、日历、人、旗），放进现有 `.q-ic`，保留 `tone-brand` / `tone-accent` / `tone-neutral` / `tone-surface` 的背景变量。图标 22×22，圆底直径保持现在的尺寸。标签「购卡 / 团课 / 私教 / 活动」留在圆下面，不要再塞进圆里。
- **已修**：after 图：`after/home-ajie.png`、`after/home-xiaolu.png`。图标是 `lib/icons.ts` 里的 SVG，用 CSS mask + `currentColor` 画（小程序不支持内联 `<svg>`）。

### H6. 入场成功后首页仍是「扫码入场」

- 页面/路由：`pages/index/index`
- 截图：`before/home-ajie-after-checkin.png`（阿杰刚在滨港店入场，按钮仍是「扫码入场」）。原型：`prototype/home-ajie-after-checkin.png`（按钮是「今天已入场」）。
- 问题：模板注释写着今天入没入过场先不做，按钮写死「扫码入场」。入场记录接口已经有了：`api.me.checkIns(month)` 返回 `ClimbCalendar`，`days[].on` 是 `YYYY-MM-DD`。日历页 `pages/me/calendar.vue` 已在用。
- 文件：`apps/miniapp/src/pages/index/index.vue` 的 `onShow` 和 `.scan` 模板。
- 改法：`onShow` 里登录后调用 `api.me.checkIns(monthOf(toDateKey(new Date())))`（`monthOf` 从 `@climb/core` 引入，和日历页一样）。`days` 里有今天的 `on` 时，标题改成「今天已入场」，hint 改成「再扫一次不会重复扣次」。点击仍走 `scan()`，确认页已经会说明这次不扣次（`before/checkin-confirm-reentry.png`）。没登录或请求失败时保持「扫码入场」。不要在首页重算扣次。
- **已修**：after 图：`after/home-ajie-after-checkin.png`

### H7. 「我的」是四行导航

- 页面/路由：`pages/me/index`（tab）
- 截图：`before/me-ajie.png`、`before/me-max.png`、`before/me-xiaolu.png`。原型：`prototype/me-ajie.png`、`prototype/me-ajie-bottom.png`
- 问题：只有「我的排班 / 攀爬日历 / 订单记录 / 保险与告知书」四张白卡片，下面一行灰字「其他入口还在做」。没有头像、手机号、卡名、统计、日历预览、菜单箭头。教练账号只是多一行「我的排班」，这块要保留。
- 文件：`apps/miniapp/src/pages/me/index.vue`。会员数据在 `member.state.me` 和 `member.state.cards`。日历格子算法在 `pages/me/calendar.vue` 的 `cells`。
- 改法：按原型重排这一页，删掉「其他入口还在做」。
  - 头部：圆底 56px，`background: var(--brand)`，里面是昵称第一个字，`font-family: var(--font-display)`，`color: var(--on-brand)`。旁边昵称 18px/600，手机号 13px `var(--ink-muted)`。有期限卡时右侧一个 pill：`background: var(--brand-soft)`，描边 `var(--stroke) solid var(--ink)`，文案用卡名。
  - 三项统计（本月到馆、持有卡、剩余次数）数字用 `var(--font-number)`、28px、字重 800，标签 12px `var(--ink-muted)`。次数用卡上已经有的剩余次数相加，不要另写规则。没有的项显示 0。
  - 日历预览：本月，表头周一到周日（和 M6 同一套算法），有入场的日期底色 `var(--brand)`。整块 `@tap` 进 `/pages/me/calendar`。
  - 菜单行：左图标或 16px 标签、右箭头 `›`，行高约 52px，分隔线 `1px solid var(--line)`。入口仍是现在这四个 URL。`member.state.me?.coach` 为真才显示「我的排班」。
  - 页面 padding `16px`，底部留出 tab 的高度，和现在卡包页一样 `padding-bottom: 32px` 即可，tab 是页面外的。
- **已修**：after 图：`after/me-ajie.png`、`after/me-max.png`、`after/me-xiaolu.png`。预览日历按周一开头；完整日历页（M6）还没改。

## 中

### M1. 确认入场的店名出现两次

- 页面/路由：`pages/checkin/confirm`
- 截图：`before/checkin-confirm-ajie.png`、`before/checkin-scan-sheet.png`（首页弹出的模拟扫码 action sheet，选店后进入此页）
- 问题：`loadPreview` 里 `uni.setNavigationBarTitle({ title: preview.store.name })`，模板里又有 `<text class="h">{{ storeName }}</text>`。导航和页面大标题都是「滨港店」。
- 文件：`apps/miniapp/src/pages/checkin/confirm.vue` 约第 63 行和第 174 行。
- 改法：导航标题固定「确认入场」。页面 `.h` 留店名，下面的说明（「今天已经入过场了，这次不扣次」这类）保持原样。没法入场时导航也用「确认入场」，页面标题仍是「没法入场」。

### M2. 入场成功页是白底上的一条绿

- 页面/路由：`pages/checkin/done`
- 截图：`before/checkin-done-ajie.png`、`before/checkin-done-reentry.png`。原型：`prototype/checkin-done-ajie.png`
- 问题：成功态是页面灰底上的一块绿条加白卡片，下面大片空白。原型是整屏 `--brand`、大时间、白明细卡、黑底「完成」按钮。再次入场的说明句子很长，但还在 16px 边距内，没有溢出。
- 文件：`apps/miniapp/src/pages/checkin/done.vue` 成功分支（`status === 'done'` 那段模板和 `.page` / `.hero` / `.btn.primary`）。
- 改法：只改成功态。`.page` 在成功时 `background: var(--brand); min-height: 100vh; padding: 32px 16px 40px`。标题 `.h` 继续 `var(--font-display)`，字号 32px，`color: var(--on-brand)`。时间用入场结果里已有的时刻，`var(--font-number)`、40px、字重 800。明细保持现在的四行（门店、用的卡、扣次、当日保险），白底 `var(--surface)`、描边、`radius-md`。按钮用 H4 的 `Button variant="dark" block`，文案改成「完成」，点击仍是 `goHome`。「投保中」pill 留在白卡片里。副文案按 H3 用 `--on-brand`。等待邀请人的那几个分支保持白底面板，不要整屏刷绿。

### M3. 领取页是一张白盒子

- 页面/路由：`pages/share/claim`
- 截图：`before/claim-bad.png`（链接无效）、`before/claim-count-own.png`、`before/claim-count-pending.png`、`before/claim-referral-pending.png`。后两张截到的是发送者自己打开的状态（「这是你自己发出的」），朋友视角的大礼品卡没有单独截到，四种状态共用 `claim.vue` 里同一个 `.box`。原型：`prototype/claim-count-pending.png`、`prototype/wechat-claim-card.png`
- 问题：待领取、已领、自己的链接、打不开，都是白底描边盒子加一行按钮。原型的待领取是米色大卡：头像圆、大数字「1 次攀岩」、有效期、水印，底部固定「领取到我的卡包」。打不开的状态也是同一张白盒子，空在页面上半截。
- 文件：`apps/miniapp/src/pages/share/claim.vue` 的模板和 `.box` / `.h` / `.chip`。
- 改法：朋友能领的那一态（没有 `mine`、没有 `blockedBy`、没有 `claimedByMe`）改成大卡：
  - 背景 `var(--accent)`，描边 `var(--stroke) solid var(--ink)`，`border-radius: var(--radius-lg)`，`box-shadow: 0 4px 0 var(--ink)`，padding `20px 16px`。
  - 左上小圆 36px `background: var(--brand)`，字是 `fromName` 第一个字。
  - 次数用 `var(--font-number)` 48px / 800，单位 16px。老带新没有次数时，大标题用 `var(--font-display)` 28px「免费来爬一次」。
  - 右下角水印 `/static/gym/mark.png`，`opacity: 0.15`，`pointer-events: none`。这个路径 `share-link.ts` 已经在用。
  - 主按钮固定在页面底部：`position: fixed; left: 16px; right: 16px; bottom: 24px`，用 `Button variant="primary" block`。已登录文案「领取到我的卡包」，未登录仍是「登录后领取」。页面 `padding-bottom: 96px`，避免按钮盖住说明。
  - 自己的链接、已领、被挡住、打不开，继续用白盒子，但打不开时盒子不要只贴在顶上：垂直方向用现在的 padding 即可，按钮保持全宽。状态 chip 继续 `var(--brand-soft)`。

### M4. 老带新是说明盒子，没卡时没有去办卡

- 页面/路由：`pages/share/referral`
- 截图：`before/referral-ajie.png`、`before/referral-sent.png`、`before/referral-xiaolu-blocked.png`。原型：`prototype/referral-ajie.png`、`prototype/referral-xiaolu-blocked.png`
- 问题：整页是白盒子。名额数字「1/1」本身对齐没问题。小鹿没有期限卡时只有灰字「有期限卡才能发老带新邀请」，原型底部有「去办期限卡」。
- 文件：`apps/miniapp/src/pages/share/referral.vue`。`status.blockedBy === 'no-period-card'` 时文案来自 `codeMessage`（`apps/miniapp/src/lib/errors.ts`）。
- 改法：顶部一块和首页老带新横条一样的板：背景 `var(--accent)`，描边，`border-radius: var(--radius-lg)`，`box-shadow: 0 4px 0 var(--ink)`。说明文字放在这块里。名额数字保持 `var(--font-number)`。`blockedBy === 'no-period-card'` 时，在灰字下面加 `Button variant="primary" block`，文案「去办期限卡」，`uni.navigateTo({ url: '/pages/shop/index?seg=period' })`。其他 `blockedBy`（例如额度用完）不要加这个按钮。步骤如果要补，用三行编号即可，不要新写规则。

### M5. 会员卡没有进度和水印

- 页面/路由：`pages/cards/index`、`pages/cards/detail`
- 截图：`before/cards-ajie.png`、`before/cards-ajie-bottom.png`、`before/card-detail-year.png`、`before/card-detail-count.png`。原型：`prototype/cards-ajie.png`、`prototype/card-detail-year.png`
- 问题：卡的底色、描边、大数字是对的。缺原型上的进度条和右下角线稿水印。期限卡也没有「本月还能带朋友」这一行；这行数据老带新页已经有（`api.me.referrals()` 的 `left`），卡面上可以带一句，没有数据就不要编。
- 文件：`packages/ui-mp/src/MemberCard.vue`，比例在 `apps/miniapp/src/lib/card-view.ts` 算好再传入。
- 改法：`MemberCard` 增加可选 `progress?: number`（0 到 1）。组件里在 meta 下方画一条高 6px 的轨道：`background: var(--ink); opacity` 用一条独立的 inner bar，轨道本身 `background: rgba(0,0,0,.12)` 会写死颜色，改成轨道 `background: var(--ink); opacity: 0.15` 包一层，填充层 `background: var(--ink); width: progress%`，`border-radius: 99px`。不要在组件里算天数。`card-view.ts` 用卡上已有的 `startsOn` / `expiresOn` 或剩余次数 / 总次数算出比例传进去。水印：卡内 `position: absolute; right: 8px; bottom: 8px; width: 72px; opacity: 0.15`，`src="/static/gym/mark.png"`。`.mcard` 加 `position: relative; overflow: hidden`。操作按钮保持现在的文字按钮，390 下三枚已经排得下（`before/cards-ajie-bottom.png`）。

### M6. 攀爬日历从周日开头

- 页面/路由：`pages/me/calendar`
- 截图：`before/calendar-ajie.png`、`before/calendar-ajie-prev.png`、`before/calendar-xiaolu-empty.png`。原型日历在 `prototype/me-ajie.png` 里，表头是一到日。
- 问题：`cells` 用 `fromDateKey(days[0]).getDay()` 补空，表头是 `WEEKDAYS`（`packages/utils/src/date.ts` 从「周日」开始），页面 `.wd` 用 `w.slice(1)`，所以表头是日一二三四五六。2026-10-01 是周四，会错一格。
- 文件：`apps/miniapp/src/pages/me/calendar.vue` 的 `cells` 和表头。H7 的预览用同一套。
- 改法：只改这个页面，不要改 `WEEKDAYS`。表头写成 `['一','二','三','四','五','六','日']`。`lead = (fromDateKey(days[0]).getDay() + 6) % 7`。有入场的格子继续用现在的品牌底。空月份「这个月还没来过」改成 M7 的空状态，不要只留一行灰字。

### M7. 空状态长短不一

- 页面/路由：卡包、订单、团课、分享、保险、日历
- 截图：`before/cards-xiaolu-empty.png`（有大标题和按钮）、`before/orders-xiaolu-empty.png`、`before/classes-empty-day.png`、`before/classes-mine-empty.png`、`before/share-count-empty.png`、`before/insurance-xiaolu-empty.png`、`before/calendar-xiaolu-empty.png`。原型空卡包：`prototype/cards-xiaolu-empty.png`
- 问题：卡包空状态是标题 + 说明 + 按钮，居中。订单、团课、保险、日历、不能分享的次卡只有一行 `var(--ink-muted)`。
- 文件：新建 `packages/ui-mp/src/Empty.vue`。替换上述页面里单独的一行灰字。卡包现有 `.empty` 也换成它。
- 改法：props `title`、`text`、默认 slot 放按钮。容器 `padding: 48px 24px; text-align: center`。标题 `font-family: var(--font-display); font-size: 22px`。说明 `margin-top: 8px; font-size: 13px; line-height: 1.5; color: var(--ink-muted)`。文案沿用各页现在的句子，不要改成营销句。卡包空状态的「去购卡」仍走原来的 `open('shop')`。

### M8. 确认弹窗的按钮是系统蓝

- 页面/路由：结算、卡详情冻结、团课预约、生成分享、发老带新邀请
- 截图：`before/checkout-pay-modal.png`、`before/checkout-pay-cancelled.png`、`before/card-freeze-confirm.png`、`before/classes-book-modal.png`、`before/share-count-confirm.png`、`before/referral-confirm.png`。原型支付：`prototype/checkout-pay-sheet.png`
- 问题：这些都是 `uni.showModal`。确认按钮是 iOS 蓝，和全站黑 / 品牌绿按钮不是一套。支付弹窗是居中系统框，原型是底栏：商品名、金额、取消和确认。
- 文件：新建 `packages/ui-mp/src/Sheet.vue`。调用点：
  - `apps/miniapp/src/api.ts` 的 `mockPayment`（约第 95 行，`title: '模拟支付'`）
  - `pages/cards/detail.vue` 冻结确认
  - `pages/classes/index.vue` 预约确认和不能取消的提示
  - `pages/share/count.vue`、`pages/share/referral.vue` 生成前的确认
- 改法：`Sheet` 用 `v-model` 或 `open` + `confirm` / `cancel` 事件。遮罩 `position: fixed; inset: 0; background: rgba(0,0,0,.45)`。卡片 `background: var(--surface)`，描边，`border-radius: var(--radius-md)`，padding `20px 16px`。按钮用 H4 的 Button：取消 `ghost`，确认 `dark`。支付这一处用贴底：`left: 0; right: 0; bottom: 0; border-radius: var(--radius-lg) var(--radius-lg) 0 0`，金额 `var(--font-number)` 28px。文案保持现在 modal 里的 title 和 content。不要改 uni 的全局 modal CSS。

### M9. 首页今日团课是单店竖列表

- 页面/路由：`pages/index/index`
- 截图：`before/home-ajie.png` 的「今日团课」。原型：`prototype/home-ajie.png`、`prototype/home-ajie-bottom.png` 的横滑小卡。
- 问题：现在是 `.panel.class-row` 竖排，一家店、一行时间加课名。原型是横向小卡，能露出下一张。课的数据里没有难度标签，不要编「V0」这类字。
- 文件：`apps/miniapp/src/pages/index/index.vue` 的团课 `v-for` 和 `.class-row`。
- 改法：外包一层横向滚动：`display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px`（小程序用 `scroll-view` `scroll-x`）。每张卡 `flex: 0 0 200px`，白底，描边，`border-radius: var(--radius-md)`，padding `12px`。时间 `var(--font-number)` 18px / 800。店名和教练放 12px `var(--ink-muted)`。剩余名额保持现在的文案。点击仍 `open('classes')`。「课表」链接留在标题右侧。

### M10. 告知书勾选框看起来像单选

- 页面/路由：`pages/checkin/confirm` 里的告知书
- 截图：`before/checkin-waiver-expanded.png`、`before/checkin-waiver-expanded-bottom.png`、`before/checkin-confirm-xiaolu.png`
- 问题：`.box` 是 18×18，`border-radius: var(--radius-sm)`。`--radius-sm` 是 10px，18px 的盒子会画成圆，和上面选卡的圆形 radio 分不清。
- 文件：`apps/miniapp/src/pages/checkin/waiver.vue` 的 `.box`。
- 改法：`.box { border-radius: 4px; }`。选中打勾颜色 `var(--ink)`。不要改 `--radius-sm` 本身，按钮圆角还要用它。展开后的条款能滚到底（`before/checkin-waiver-expanded-bottom.png`），padding 够用。

### M11. 分享路径和标题挤在一行，token 从中间断开

- 页面/路由：`pages/share/count`、`pages/share/referral`
- 截图：`before/share-count-created.png`、`before/referral-sent.png`
- 问题：`.fine` 是 `{{ title }} · {{ claimPath }}`，再加 `word-break: break-all`。390 宽下 token 断成 `…L_C` / `VOEGxuE7tfA` 这样两行，标题和 `/pages/share/claim?t=` 混在一段 12px 灰字里。
- 文件：`apps/miniapp/src/pages/share/count.vue`、`apps/miniapp/src/pages/share/referral.vue` 的 `.fine`。
- 改法：标题单独一行，`font-size: 14px; color: var(--ink)`。路径单独一行：`display: block; margin-top: 8px; font-size: 12px; line-height: 1.5; color: var(--ink-muted); overflow-wrap: anywhere`。去掉 `word-break: break-all` 和中间的 ` · `。复制按钮文案保持「复制领取路径」，复制的内容仍是完整 path。

### M12. 教练排班的提示和格子对不上

- 页面/路由：`pages/coach/schedule`
- 截图：`before/coach-today.png`、`before/coach-tomorrow.png`、`before/me-max.png`（入口）。原型：`prototype/coach-tomorrow.png`
- 问题：提示写「点空闲的格子占上」，列表是 10:00–22:00 的通栏行，不是格子。空闲、线下约、不排课靠底色能分开（白 / `--accent` / `--neutral`），但空闲行和已占用行都是实线框。原型的空闲是虚线。底部语音输入不要做。
- 文件：`apps/miniapp/src/pages/coach/schedule.vue` 的提示文案和 `.row`。
- 改法：提示改成「点空闲的时段占上（线下约的、有事），会员那边马上约不了。」空闲行 `border-style: dashed`。已约或线下约保持实线，底色继续 `var(--accent)`。不排课底色 `var(--neutral)`。不要加底部输入条。

## 低

### L1. 首页水印用了照片 logo

- 页面/路由：`pages/index/index`
- 截图：`before/home-ajie.png` 右上角的半透明图形。原型用的是线稿 `mark.png`。
- 问题：`const mark = \`/static/gym/${gym.logo}\``，`gym.logo` 是 `logo.jpg`。半透明照片压在问候语后面。`gyms/benchmark/assets/mark.png` 会进 `/static/gym/mark.png`。
- 文件：`apps/miniapp/src/pages/index/index.vue` 约第 17–18 行和 `.hero-mark`。
- 改法：src 改成 `/static/gym/mark.png`。`.hero-mark` 的 `right: -36px; top: -18px; width: 210px; opacity: 0.17` 可以留。图片加载失败时再退回 `gym.logo`。

### L2. 底部 tab 没有图标

- 页面/路由：三个 tab 页都有
- 截图：`before/home-ajie.png`、`before/cards-ajie.png`、`before/me-ajie.png` 底部。原型 tab 在 `prototype/home-ajie.png`，选中项是品牌绿圆底图标。
- 问题：`apps/miniapp/pages.base.json` 的 `tabBar.list` 只有 `text`，没有 `iconPath` / `selectedIconPath`。选中只靠字色，三个字在 390 宽下间距很大，选中态弱。
- 改法：给首页、卡包、我的各做一对 48×48 的 png（未选中描边黑，选中落在 `--brand` 圆底上），填进 `iconPath` 和 `selectedIconPath`。`selectedColor` 已经是品牌绿，保持。不要加第四个 tab。

### L3. 保险列表的标题和签署日期挤在一行

- 页面/路由：`pages/me/insurance`
- 截图：`before/insurance-ajie.png`、`before/insurance-ajie-expanded.png`、`before/insurance-ajie-expanded-bottom.png`
- 问题：告知书标题和签署日期在同一个 flex 行。标题一长，日期掉到标题右侧的中间，不是稳定的右上角。展开后最后一张卡能滚出来，底部 padding 够。
- 文件：`apps/miniapp/src/pages/me/insurance.vue` 的 `.top`。
- 改法：`.top { display: flex; align-items: flex-start; gap: 8px; }`。标题 `flex: 1; min-width: 0`。日期 `flex: none; font-size: 12px; color: var(--ink-muted)`。

### L4. 领取说明里岩馆名和后文粘在一起

- 页面/路由：`pages/share/claim`
- 截图：`before/claim-count-pending.png` 的「2027.02.17 前在BENCHMARK任意一家店」
- 问题：`claim.vue` 的 hint 是 `` `前在${gym.shortName}任意一家店` ``，`shortName` 是 `BENCHMARK`，中间没有空格。
- 改法：改成 `` `前在 ${gym.shortName} 任意一家店扫码入场。` ``。只加空格，不要改句子意思。

### L5. 已取消的课，原因和状态并排

- 页面/路由：`pages/classes/index`
- 截图：`before/classes-cancelled.png`（周六「先锋攀登体验」，「已取消」pill 在原因文字中间的高度）
- 问题：原因「这节取消了：教练临时有事，这节停一次」和 pill 在同一行，窄屏下原因折成两行，pill 垂直居中悬在文字旁边。七天的日期条在 390 下是齐的，不用改。
- 文件：`apps/miniapp/src/pages/classes/index.vue` 课卡片的右侧结构。
- 改法：第一行左边时间、右边 pill。原因单独一行放在课名下面，`font-size: 12px; line-height: 1.5; color: var(--ink-muted)`。pill 保持描边和现在的文案。

### L6. 登录框的占位符是开发说明

- 页面/路由：`pages/login/index`（没有原型页）
- 截图：`before/login-privacy.png`、`before/login-phone.png`、`before/login-phone-invalid.png`
- 问题：布局、logo、协议勾选、错误 toast「手机号是 11 位数字」都清楚。输入框 placeholder 是「手机号（开发用，代替微信验证）」，会员 H5 上也能看到。
- 文件：`apps/miniapp/src/pages/login/index.vue` 的 input placeholder。
- 改法：placeholder 改成「手机号」。校验和 toast 不用动。

## 建议的修改顺序

1. H4 的 `Button.vue`，同时修确认页禁用态。
2. H1、H2 去掉任务号，并接上扫码和团课跳转。
3. H3 品牌底上的文字颜色。
4. H5、H6、L1 首页扫码按钮、图标、水印。
5. H7 和 M6 一起做「我的」和日历周一开头。
6. M7 的 `Empty.vue`，顺手改 L3、L5。
7. M8 的 `Sheet.vue`，换掉支付和确认弹窗。
8. M2、M3、M4、M5、M9、M11、M12、M1、M10、L2、L4。
