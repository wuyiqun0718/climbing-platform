# 门店后台 UI 验收（apps/dashboard）

验收日期：2026-10-22。只看界面，没有改 `apps/` 或 `packages/`。

视口 **1440×900**（另抽了 768×900、390×844 看窄屏）。演示账号密码都是 `123456`：

| 手机号 | 角色 | 门店 |
|---|---|---|
| 13800000001 | 老板（馆长） | 全部门店 |
| 13800000002 | 店长（店长阿凯） | 只有滨港店 |
| 13800000003 | 前台（前台小葵） | 只有滨港店 |

实现截图在 `docs/ui-review/before/`，原型截图在 `docs/ui-review/prototype/`。原型图藏掉了页面最上面的「小程序 / 教练端 / 管理后台」切换条，让后台本身铺满 1440×900，方便对照。原型里的「定线分析」（`prototype/routes.png`）是第二期，后台导航没有这一项，**不算缺陷**。

## 统计

| 严重程度 | 条数 |
|---|---|
| 高 | 6 |
| 中 | 9 |
| 低 | 3 |
| 合计 | 18 |

先修高的。中里 10–15 是和原型的结构差，高优先级的布局修好后再做，不要为了对齐原型先引入图表库。

---

## 高

### 1. 窄屏顶栏把后面的导航和「退出」滑出屏幕

> **已修**：`after/owner-narrow-768-dashboard.png`、`after/owner-narrow-390-dashboard.png`、`after/owner-narrow-768-members.png`、`after/owner-narrow-390-members.png`。只有 `nav` 横滑，「退出」768 宽在 708–756、390 宽在 330–378。600px 以下导航另起一行占满宽度，不然 390 宽只看得见一项。

- 页面：所有已登录页。路由 `/`、`/members` 等。断点是 `App.vue` 的 `@media (max-width: 900px)`。
- 截图：`before/owner-narrow-768-dashboard.png`、`before/owner-narrow-390-dashboard.png`、`before/owner-narrow-768-members.png`。对照宽屏 `before/owner-dashboard.png`。
- 现象：文档没有被撑出横向滚动（`documentElement.scrollWidth` 仍等于视口），但侧栏自己在横滑。768 宽时「员工」右边缘在 773px，「操作日志」777–858，「设置」862–914，「馆长」932–961，「退出」969–1017，全部在视口外面。390 宽时看得见的只有标志、数据看板、财务、会员（会员右边缘 376）。「退出」要在黑条上横滑才找得到，滚动条在 macOS 上几乎看不见。
- 文件：`apps/dashboard/src/App.vue` 底部 `@media (max-width: 900px)`。`.side` 是一行 flex，`nav` 改成 `display: flex` 且子项 `white-space: nowrap`，`.me` 用 `margin-left: auto` 跟在导航后面。整条 `.side` 设了 `overflow-x: auto`，所以用户块和导航一起被卷走。
- 改法：窄屏时只让 `nav` 横滑，用户和退出钉在右侧。
  - `.side { min-width: 0; }`
  - `nav { flex: 1 1 auto; min-width: 0; overflow-x: auto; }`
  - `.me { flex: none; margin-left: 8px; }`
  - 不要再给整个 `.side` 做横向滚动。
  - 黑底上的 `#fff`、`#2b2b2b`、`#d6d6d0`、`#a3a39b` 见问题 15，这一条先把退出留在屏幕里。

### 2. 窄屏页头按钮被压成竖排，字被裁切

> **已修**：`after/owner-narrow-390-members.png`、`after/owner-narrow-390-courses.png`（另有 `after/owner-narrow-768-courses.png`、`after/owner-members.png`、`after/owner-courses.png`）。390 宽「新建会员」96×38，「上一周」67×32，「复制上周课表」106×32。`.bar .btn` 改成 2px 黑框。

- 页面：会员 `/members`、课程 `/courses`，同样写法的还有财务筛选旁的按钮、入场页工具条、卡种页「新建卡种」。
- 截图：`before/owner-narrow-390-members.png`、`before/owner-narrow-390-courses.png`。宽屏对照 `before/owner-members.png`、`before/owner-courses.png`。
- 现象（390 宽，实测）：
  - 会员页「导出会员 / 导出卡 / 收款开卡 / 新建会员」各约 **54×104**。四个字被折成四行，挤在标题右边的同一行里。
  - 课程页「上一周」**48×32**（样式把高度锁死在 32px，三个字塞不进）、「复制上周课表」**69×32**。字被裁切。
- 原因：
  - `MembersPage.vue` `.page-h` 是 `display: flex`，没有 `flex-wrap`。`.actions` 也没有换行。按钮是 flex 子项，默认可缩小，又没有 `white-space: nowrap`，中文按字断开。
  - `ClassSchedule.vue` `.bar` 同样不换行。`.btn { height: 32px; padding: 0 12px }`，缩到 48px 宽时文字溢出被切掉。
  - `CoursesPage.vue` `.sub-h` 把标题、一句很长的说明、`新建团课课程` 放在同一行（`.sub-h p { flex: 1 }`）。窄屏时说明和按钮抢同一行。
  - 原型 `prototype/styles.css` 的 `.page-h` 有 `flex-wrap: wrap` 和 `align-items: flex-end`。
- 改法（各页一起改，不要只修会员页）：
  - `.page-h`、`.actions`、`.tools`、`.sub-h`、`ClassSchedule.vue` 的 `.bar` 都加上 `flex-wrap: wrap`。
  - 所有页头按钮（`.create`、`ExportButton.vue` 的 `.export`、`.bar .btn`）加 `white-space: nowrap; flex: none`。
  - `.sub-h` 在窄屏让说明单独占一行：`@media (max-width: 900px) { .sub-h { align-items: flex-start; } .sub-h p { flex-basis: 100%; } }`。
  - `ClassSchedule.vue` 的 `.btn` 不要再写死和 2px 黑框不一致的 1px 边（见问题 8）。

### 3. 团课名单弹窗比表格窄，「签到」在视口里看不到

> **已修**：`after/owner-courses-roster.png`、`after/owner-courses-roster-booked.png`（10.24 已约的行，三个按钮都能看到）。弹窗 720px，表 672px，没有横滑。状态列用单元格插槽分两行（状态 / 时刻和操作人），没有改 `DataTable`。

- 页面：`/courses`，点课表行里的「名单」。
- 截图：`before/owner-courses-roster.png`。
- 现象：弹窗实测宽 **440px**，里面的表格宽 **542px**。状态列是「到了（2026.10.20 …」这种长句子，`DataTable` 单元格 `white-space: nowrap`，把「签到 / 缺席 / 帮他取消」推到右边。弹窗默认不宽，这些按钮要在弹窗里横滑才出现。截图里只能看到会员、手机号、课包剩余、被裁开的状态。
- 文件：
  - `apps/dashboard/src/components/ClassRoster.vue`：`<Modal>` 没有传 `width`，用的是 `packages/ui-web/src/Modal.vue` 的默认 `width: '440px'`。
  - 状态文案在 `ClassRoster.vue` 的 `columns` 里：`` `${STATUS_TEXT[r.status]}（${formatDotTime(...)} ${r.attendedByName}）` ``。
  - `packages/ui-web/src/DataTable.vue` 的 `td { white-space: nowrap }`。
- 改法：
  - `ClassRoster.vue` 的 Modal 传 `width="720px"`（小屏 Modal 已有 `max-width: 100%`）。
  - 状态列不要把时刻和操作人拼进同一个不换行单元格。时刻用单独一列，或给这一列允许换行。做法：`DataTable` 的 `Column` 增加可选 `wrap?: boolean`，为 true 时该 `td` 用 `white-space: normal`。名单的状态列打开它。
  - 操作列放在「状态」左边，或保证不横向滚动时「签到」仍然在 440px 里看得见。加宽弹窗之后再看 `before` 同款数据：已约的行要同时看见「签到」「缺席」「帮他取消」。

### 4. 店长和前台看到的门店名是 `huanqiu`

> **已修（临时做法）**：`after/manager-member-detail.png`、`after/desk-member-detail.png`。页面不再 `?? id`，统一用 `session.ts` 的 `storeLabel()`，查不到就显示「其他门店」。接口带 `storeName` 要改 `packages/api`，这一轮只改了 `apps/dashboard` 的界面，所以没做。

- 页面：会员详情 `/members/:id`。店长、前台各看一条归属不是滨港的会员（这次是李越，`/members` 列表第一行）。
- 截图：`before/manager-member-detail.png`、`before/desk-member-detail.png`。老板看同一类会员是中文名：`before/owner-member-detail.png`（林舟，归属「环球港店」）。
- 现象：归属门店、首次到店、最近入场的门店列都显示英文 id `huanqiu`，不是「环球港店」。
- 原因：`session.state.stores` 来自 `GET /admin/stores`，mock 里按权限过滤（`apps/dashboard/src/api/mock/adapter.ts` 约 1922 行，`db.stores.filter(st => canSeeStore(...))`）。店长和前台的列表只有滨港店。页面用这份列表反查店名，找不到就把 id 原样打出来：
  - `MemberDetailPage.vue`：`storeName()` 里 `?? sid`
  - 同样写法：`DashboardPage.vue`、`FinancePage.vue`、`EntriesPage.vue`、`AuditPage.vue`、`ShareRecords.vue`、`ClassSchedule.vue`、`StaffPage.vue` 的 `storeNameOf`
- 改法：展示用的店名不要从「能操作的店」里查。
  - 会员详情、入场行、订单行由接口带上 `storeName`（mock 用 `db.stores` 的 `name` 填）。`packages/api` 里对应类型加上字段，页面优先显示这个字段。
  - 在接口改完之前，页面禁止 `?? id`。找不到就显示「其他门店」，不要显示 `huanqiu`。
  - 不要把 `stores.list` 改成返回全部店来凑这个显示，那个接口现在是权限边界（`adapter.test.ts` 断言前台只能拿到滨港）。店名跟着会员/入场数据走。

### 5. 前台入场码是一块空白，URL 在方框中间被折断

> **已修**：`after/owner-desk-bound.png`。占位块最宽 320px，用 `overflow-wrap: anywhere`，加了说明。「刚入场」跟内容一样高。

- 页面：`/desk`。店长或老板登录后选滨港店，点「绑定这家店」。
- 截图：`before/owner-desk-bound.png`。未登录是 `before/desk-anon.png`，前台登录后不能绑是 `before/desk-desk-bind-denied.png`（这两张文案正常，不用改交互）。
- 现象：绑定成功后主区域是一个约 520px 的白框（`.qr` 的 `width/height: min(70vmin, 520px)`）。没有二维码图片时，框里只有两行小字：「二维码内容」和一长串 `https://qr.example.com/...`，URL 在单词中间断开。右边「刚入场」被拉得和二维码一样高，今天没人时就是一大块空白。
- 文件：`apps/dashboard/src/pages/DeskPage.vue`。`display.qr.imageUrl` 为空时走 `.placeholder`。`word-break: break-all` 已经有了，所以 URL 会在任意字符断开。
- 改法：
  - 没有图片时不要用 520px 的方框装一段 URL。占位块改成最大宽度约 320px，文字用 `overflow-wrap: anywhere`，并写清楚「接口还没返回二维码图片，下面是码的内容」。
  - `.layout` 不要为了占位把右侧列表拉成正方形。`.feed` 用内容高度，`align-self: start`。
  - 真要画二维码再加库（会动 lockfile）。这一轮先把占位做小、做可读。`imageUrl` 有值时的 `<img class="qr">` 保持不变。

### 6. 设置页「不限」在 1440 宽下折成两行

> **已修**：`after/owner-settings.png`。「不限」53×19，数字框 120px。卡片和保存按钮改成 2px 黑框。另外勾选框也吃到了 Field 的 `width: 100%`，一起压掉了。

- 页面：`/settings`（只有老板）。
- 截图：`before/owner-settings.png`。
- 现象：实测「不限」标签 **54×38**，同一页普通勾选行高是 **19**。两个字被拆到两行，勾选框旁边是「不」下面是「限」。数字框却几乎占满卡片剩余宽度，不是样式里写的 120px。另外这张卡片是 `1px solid var(--line)`、`border-radius: var(--radius-sm)`，其它页的卡片是 `var(--stroke)`（2px）实线 `var(--ink)`、`var(--radius-lg)`。
- 文件：`apps/dashboard/src/pages/SettingsPage.vue` 的 `.row`、`.check`、`.card`、`.btn`。输入框在 `Field` 的默认插槽里，`packages/ui-web/src/Field.vue` 有 `.field :slotted(input) { width: 100% }`。它和 `.row input[type='number'] { width: 120px }` 抢同一条，100% 生效后，flex 子项把「不限」压到比一个汉字略宽，中文就折行。
- 改法：
  - `.form .row input[type='number'] { width: 120px; max-width: 120px; flex: 0 0 120px; }`（比 Field 的插槽选择器多一个类，才能压过 `width: 100%`）。
  - `.check { white-space: nowrap; flex: none; }`。
  - `.card` 改成和 `StatTile` / `DataTable` 一样：`border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); background: var(--surface);`。不要再用 `1px` 和 `var(--line)`。
  - `.btn.primary` 的边框改成 `var(--stroke) solid var(--ink)`，字色 `var(--on-brand)`，底 `var(--brand)`，和会员页 `.create` 对齐（问题 8）。

---

## 中

### 7. 表格外面又套了一层 2px 黑框

- 页面：会员 `/members`、财务 `/finance`、看板「门店对比」`/`、会员详情的订单和入场 `/members/:id`。
- 截图：`before/owner-members.png`、`before/owner-members-empty.png`、`before/owner-finance.png`、`before/owner-dashboard.png`、`before/owner-member-detail.png`。没有这个问题的对照：`before/owner-products.png`、`before/owner-staff.png`、`before/owner-entries-1021.png`（这些页的表格自己就是唯一的框）。
- 现象：1440 下会员列表面板实测 **1168px 宽、border 2px、padding 16px 18px**，里面的 `DataTable` `.wrap` 又是 **1128px、border 2px**。两层黑框中间有约 18px 的白边。财务「按收款方式」同样：外层面板 576px，内表 536px。
- 文件：
  - `packages/ui-web/src/DataTable.vue` `.wrap` 自带 `border: var(--stroke) solid var(--ink)` 和 `border-radius: var(--radius-lg)`。
  - 外层又画了一遍的：`MembersPage.vue` `.panel`、`FinancePage.vue` `.panel`、`DashboardPage.vue` `.panel`、`MemberDetailPage.vue` `.panel`。
  - 原型是一张卡片包住表：`prototype/styles.css` 的 `.card.flush`（卡片有框，表本身没有第二层框）。
- 改法：一张表只留一个框。推荐给 `DataTable` 加 `plain`（或 `nested`）属性，为 true 时 `.wrap` 不要 border、不要 radius、背景透明。上述四个页面里，已经放在 `.panel` 里的表打开它。面板继续负责标题、2px 黑框和圆角。不要把产品页、员工页、入场页的表再套进带框的 `.panel`（它们现在是对的）。

### 8. 按钮、页签、分页、链接各写各的

- 页面：几乎所有已实现页。宽屏就能看出来，不必等窄屏。
- 截图：`before/owner-members.png`（绿底 + 2px 黑框的「新建会员」，白底黑框的「导出」）、`before/owner-courses.png`（「上一周」是 1px 灰边，「加一节课」是绿底但边框不是黑的）、「新建团课课程」又是 2px 黑框）、`before/owner-entries.png`（页签是小药丸）、`before/owner-finance.png`（「本月 / 上月」是 2px 黑描边药丸，选中底是 `var(--accent-soft)`）、`before/owner-products.png`（「下架」是品牌绿色链接）、`before/owner-member-detail.png`（「调整」是黑色下划线）。
- 现在至少有三套：

| 样子 | 写在哪 |
|---|---|
| 2px `var(--ink)` 边，主按钮绿底 `var(--brand)` / `var(--on-brand)` | `MembersPage.vue` `.create`、`ProductsPage.vue` `.create`、`StaffPage.vue` `.create`、`ExportButton.vue` `.export`、`CoursesPage.vue` `.create` |
| 1px `var(--line)` 边，主按钮 `border-color: var(--brand)` | `ClassSchedule.vue` `.btn`、`SettingsPage.vue` `.btn`、`CoachTimeline.vue` `.btn`、`packages/ui-web/src/ConfirmButton.vue` `.btn`、`packages/ui-web/src/Pager.vue` `.btn` |
| 链接一会儿 `var(--brand)` 一会儿 `var(--ink)` | 品牌色：`ProductsPage.vue`、`StaffPage.vue`、`CoursesPage.vue`、`ClassSchedule.vue`、`ClassRoster.vue`。黑色：`MemberDetailPage.vue` `.link`、`DashboardPage.vue` `.link`、`ConfirmButton.vue` `.trigger.link` |

- 改法：在 `packages/ui-web` 加两个按钮组件（或一个带 `variant` 的 `Button.vue`），页面不要再各写 `.btn` / `.create`。
  - `primary`：`color: var(--on-brand); background: var(--brand); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); font-weight: 600;`
  - `secondary`：`color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink);` 导出、上一周、取消用这个。
  - 危险确认继续用现在 `ConfirmButton` 的深色字块，但边框改成 `var(--stroke) solid var(--ink)`，不要 `1px solid var(--line)`。
  - 表格里的文字按钮统一成一种：`color: var(--ink); font-weight: 700; text-decoration: underline; background: none; border: 0;`。不要再用 `var(--brand)` 当链接色（品牌色留给主按钮和当前导航）。
  - 页签统一成一套。原型是下划线页签（`prototype/styles.css` `.tabs`：底边 2px `var(--ink)`，选中项白底、上边和左右是 2px 黑线）。`EntriesPage.vue` 的药丸页签和 `FinancePage.vue` 的 `.chip` 收成 `packages/ui-web` 的一个 `Tabs`（或 `Chip`）。选中态用 `background: var(--ink); color: var(--surface)` 或原型那种下划线，不要财务用 accent 底、入场用加粗黑边，两套并存。
  - `Pager.vue` 当前页可以继续 `background: var(--brand); color: var(--on-brand)`，边框改成 `var(--stroke) solid var(--ink)`。

### 9. 会员详情「风险告知书」把版本号拆到下一行

- 页面：`/members/:id`。
- 截图：`before/owner-member-detail.png`、`before/owner-member-freeze.png`、`before/desk-member-detail.png`。三张都是「2026.10.17 签的（2026-01」一行，「版）」单独一行。
- 文件：`MemberDetailPage.vue` `.info dl { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }`。1440 下去掉侧栏后大约排得下 5 列，最后一列约 200px，装不下「2026.10.17 签的（2026-01版）」。
- 改法：`minmax(200px, 1fr)` 改成 `minmax(240px, 1fr)`。日期和版本用一个 `<span style="white-space: nowrap">` 包住（或 class `.nowrap`），避免在「版」前面断开。若仍然挤，让「风险告知书」这一项 `grid-column: 1 / -1` 单独占一行。未签的 `.warn` 底色 `var(--accent-soft)` 可以保留。

### 10. 课程排期和原型不是同一种版面，规则区没有卡片

- 页面：`/courses`。
- 截图：`before/owner-courses.png`、`before/owner-courses-pt-slot.png`。原型：`prototype/courses.png`、`prototype/courses-pt.png`、`prototype/drawer-class.png`。
- 现象：
  - 原型团课是未来 7 天的列（今天黑底白字），每节课一张卡，底下一条人数比例。实现是一张周范围表格（日期、时间、门店、课程、教练、已约/上限）。
  - 原型私教是色块时间轴：空闲是虚线格里一个「空」，已约是绿底白字的会员名。实现是每个格子都写「空闲 / 会员约 / 线下约」，图例在格子下面再重复一遍。没有原型里「刚约的那节」的黑框（`docs/walkthrough-dashboard.md` 已记过）。
  - 「团课课程」「私教」的 `h2` 是 16px 系统字体。看板上的区块标题是 `font-family: var(--font-display); font-size: 20px; font-weight: 400`。
  - 「团课规则」的 `<section class="card">` 在 `CoursesPage.vue` 里没有背景、没有边框、没有内边距，只有 `.card h2` 的字号。输入框直接铺在页面灰底上，和上面的黑框表格断开。
- 改法：
  - 规则区补上和问题 7 一样的面板：`padding: 16px 18px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg);`。小节 `h2` 用 `var(--font-display)`、20px、字重 400，和 `DashboardPage.vue` `.panel h2` 一致。
  - 私教格子不要在每一格里重复「空闲」两个字。`CoachTimeline.vue`：`.cell.free` 用虚线边（`border: 1px dashed var(--line)`），文字只在图例里出现；`.cell.member` 显示会员名（数据里已有 `booking.memberName`，现在 `label()` 会返回名字，但空闲格仍写「空闲」）。已约格子加 `outline: var(--stroke) solid var(--ink)`，和原型的黑框对齐。颜色继续用 `var(--brand)`、`var(--accent)`、`var(--neutral-soft)`，不要写死。
  - 团课周视图是结构改动：`ClassSchedule.vue` 在宽屏改成 7 列（原型 `.week` / `.wk-item` / `.wk-h.today`）。今天的列头用 `background: var(--ink); color: var(--surface)`。人数条用一个 `span`，宽度是已约/上限，底色 `var(--brand)`。窄屏（问题 2）允许整行横滑，容器 `overflow-x: auto; min-width: 0`，不要再把「上一周」压扁。表格可以留作窄屏的降级，但 1440 应以周视图为主。

### 11. 看板和财务比原型少了图和实时动态

- 页面：`/`、`/finance`。
- 截图：`before/owner-dashboard.png`、`before/owner-dashboard-bingang.png`、`before/desk-dashboard.png`（前台营收是「—」，这是权限，不是样式错）、`before/owner-finance.png`。原型：`prototype/dash.png`、`prototype/dash-store.png`、`prototype/finance.png`。
- 已经对齐的：四张指标卡、绿底主卡、新客/老带新横条、2px 黑框、标题用展示字体。前台主卡里的「—」可以保留。
- 和原型差的（看板）：没有近 30 天营收柱、没有本月营收构成的彩色条、没有今日时段入场柱、没有今日团课、没有实时动态。门店对比是纯数字表，原型在营收列还有一条比例条。7 天内到期没有「提醒续费」按钮，到期项是网格，不是带分隔线的列表。
- 和原型差的（财务）：没有近 12 个月柱状图，没有收款方式横条和品类涨跌。现在是三张指标卡加两张表加退款表，表本身对齐正常。
- 改法：这一条不要新加图表依赖。若要补，放在 `DashboardPage.vue` / `FinancePage.vue`，颜色用 `var(--chart-1)` … `var(--chart-5)` 和 `packages/ui-web/src/BarList.vue`。门店对比的营收列可以先做一条 CSS 比例条（原型 `.cmp-bar`），不必上图表库。到期列表用和原型一样的行：名字加粗 14px，说明 12px `var(--ink-muted)`，行间 `border-top: 1px solid var(--line)`。

### 12. 入场页没有汇总条，页签也不是原型那种

- 页面：`/entries`、`/entries?tab=shares`。
- 截图：`before/owner-entries.png`（2026-10-22，0 条）、`before/owner-entries-1021.png`（2026-10-21，27 条，表本身是齐的）、`before/owner-entries-shares.png`。原型：`prototype/entries.png`、`prototype/entries-shares.png`。
- 现象：原型顶部是四张人次卡，下面一条投保说明（浅品牌底）。表有「时间」列（22:33 这种）。实现只有日期选择、一行「入场 N 人次」和表，没有时刻。接口 `CheckInListRow`（`packages/api/src/admin.ts`）目前只有 `on`，没有入场时刻，所以不是漏渲染，是列和数据都没有。页签样式见问题 8。
- 改法：
  - 在表上方用现成的 `StatTile` 做四格：今日入场、期限卡、次卡和单次票、好友赠送和老带新。数字用 `var(--font-number)`。投保说明用一条 `background: var(--brand-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg)`，不要新写一套颜色。
  - 时刻要补数据字段再加列。没有字段之前不要留一个空的「时间」列。
  - 分享页的筛选下拉可以留下。空状态「还没有分享」已经在 `ShareRecords.vue`，不用改文案。

### 13. 会员列表没有原型的筛选和卡状态

- 页面：`/members`。
- 截图：`before/owner-members.png`、`before/owner-members-empty.png`、`before/owner-members-page2.png`。原型：`prototype/members.png`、`prototype/members-empty.png`。
- 现象：原型有「全部 / 期限卡 / 次卡 / 7 天内到期 / 30 天没来」药丸，行内有头像、卡名、到期芯片（快到期是警告色）、本月到店、来源，以及「提醒续费 / 发回访券」。实现是搜索框加一张表（名字、打码手机号、来源、首次到店、有效卡张数、最近入场）。空状态文案是通顺的，分页也正常。搜索框 `max-width: 420px`，和表的宽度差一截，可以保留。
- 改法：筛选条用问题 8 的 Chip，放在搜索框左侧，选中态黑底白字（原型 `.fchip.on`）。到期和沉睡不要新造颜色：快到期用 `background: var(--accent-soft)`，已过期用 `var(--neutral-soft)` 加 `color: var(--ink-muted)`。头像没有 URL 时用名字最后一个字，底色 `var(--brand-soft)`，和 `DeskPage.vue` 的 `.avatar` 同一套。提醒按钮用问题 8 的 secondary，不要再写一个新的 `.btn`。

### 14. 活动页是一整屏空白说明

- 页面：`/events`。老板、店长、前台导航里都有。
- 截图：`before/owner-events.png`（店长、前台同页，`before/manager-events.png`、`before/desk-events.png`）。原型：`prototype/events.png`、`prototype/drawer-event.png`。
- 现象：`TodoPage.vue` 只有一句「这个页面还没开始做」。原型是活动卡片：左边日期色块、标题、时间地点、费用、报名进度、状态药丸，右上角「发布活动」。
- 改法：任务没做完之前，不要让导航点进去像坏掉的白屏。`TodoPage.vue` 的标题用和其它页一样的页头（展示字体 34px、副文案 13px `var(--ink-muted)`，上下间距跟 `MembersPage.vue` `.page-h`）。真做的时候新建 `EventsPage.vue`，在 `router.ts` 的 `PAGES.events` 换掉 `TodoPage`。卡片用问题 7 的单层 2px 黑框。日期块用 `var(--brand)` / `var(--accent)` / `var(--neutral-soft)` 轮换，不要在组件里写死色值。进度条是一个灰轨 `var(--neutral-soft)` 加 `var(--brand)` 填充。发布用 `Modal.vue`，不要再做一套抽屉。

### 15. 侧栏颜色写死，标题没有用展示字体

- 页面：所有已登录页的左侧栏。
- 截图：`before/owner-dashboard.png`。原型：`prototype/dash.png`（标志是反色字标 + 「门店后台」，导航有图标，底部是头像）。
- 现象：实现的侧栏能用，当前项的绿底是 `var(--brand)`，这点是对的。但 `App.vue` 里写死了 `#fff`、`#2b2b2b`、`#1d1d1b`、`#d6d6d0`、`#a3a39b`、`#3a3a37`、`#6e6e66`。品牌名是系统字体、字重 800。原型侧栏标题是展示字体。
- 改法：只改 `App.vue` 的 scoped 样式。
  - 侧栏底继续 `background: var(--ink)`，字色用 `var(--surface)`，次要字用 `color-mix(in srgb, var(--surface) 70%, transparent)` 之类，不要新的十六进制。
  - 分隔线用 `color-mix(in srgb, var(--surface) 16%, transparent)`，替换 `#2b2b2b`。
  - `.brand span` 用 `font-family: var(--font-display); font-weight: 400; letter-spacing: 0.04em;`。
  - 导航图标可以后补，不要为了图标阻塞问题 1。

---

## 低

### 16. 登录卡的演示账号在「店长」两个字中间换行

- 页面：`/login`。
- 截图：`before/login.png`、`before/login-error-phone.png`、`before/login-error-password.png`、`before/login-narrow-390.png`。
- 现象：卡片宽约 380px。演示那一行折成「13800000002（店」和「长）、13800000003（前台）」。错误态（手机号不是 11 位、密码错误）的米色提示条本身是齐的，用的 `var(--accent-soft)`，可以保留。登录卡边框是 `1px solid var(--line)`，和后台其它 2px 黑框不一致。
- 文件：`apps/dashboard/src/pages/LoginPage.vue` `.card`、`.hint`。
- 改法：每个账号用 `<span class="nowrap">13800000002（店长）</span>` 包住，`.nowrap { white-space: nowrap; }`。`.card` 的边框改成 `var(--stroke) solid var(--ink)`，圆角 `var(--radius-lg)`。主按钮边框同样改成 2px `var(--ink)`，和问题 8 的 primary 一致。

### 17. 卡种页是表格，原型是行内改价

- 页面：`/products`。
- 截图：`before/owner-products.png`、`before/owner-products-new.png`。原型：`prototype/products.png`。
- 现象：实现按期限卡 / 次卡 / 单次票 / 私教课 / 团课分表，下架行是灰色字，对齐正常，没有溢出。原型是每张卡一个价格输入框和开关，右上角「保存修改」。这是交互不同，不是坏掉。
- 改法：不必改回行内输入。若要靠近原型，只把分组标题放进问题 7 那种单层卡片的页眉（现在 `ProductsPage.vue` `.panel h2` 是 15px 系统字体，浮在表上方）。价格列已经是 `num` + `formatYuan`，保持右对齐和 `var(--font-number)`。

### 18. 分享记录很长，表头不跟着走；入场「今天」经常是空的

- 页面：`/entries?tab=shares`，以及 `/entries` 默认日期。
- 截图：`before/owner-entries-shares.png`、`before/owner-entries.png`、`before/owner-entries-empty.png`、`before/owner-entries-1021.png`。
- 现象：分享表从 10 月一直排到 9 月，一屏放不下，滚下去就没有列名。`DataTable` 的 `th` 没有 `position: sticky`。入场默认日期是本机今天（`EntriesPage.vue` 的 `toDateKey(new Date())`）。2026-10-22 这天是 0 条，2026-10-21 有 27 条。空状态文案「这天没有入场」本身清楚。
- 改法：
  - `DataTable.vue` 的 `th` 加 `position: sticky; top: 0; background: var(--surface); z-index: 1`。外层页面若有滚动，吸顶才会生效；如果滚动发生在 `.wrap` 里，吸顶相对 `.wrap`。
  - 入场空状态不用改文案。日期控件留在页头右侧（现在的位置是对的）。

---

## 修的时候注意

- 颜色只用主题变量：`var(--brand)`、`var(--on-brand)`、`var(--accent)`、`var(--accent-soft)`、`var(--ink)`、`var(--ink-muted)`、`var(--surface)`、`var(--page)`、`var(--line)`、`var(--neutral-soft)`、`var(--brand-soft)`、`var(--stroke)`、`var(--radius-sm|md|lg)`、`var(--font-display)`、`var(--font-number)`。定义在 `packages/theme`，岩馆覆盖在 `gyms/benchmark`。
- 标题用展示字体、字重 400。数字用 `var(--font-number)`。正文系统字体。这个层次现在是对的，不要改回加粗黑体标题。
- 业务判断仍然只放 `@climb/core` 和 `permissions.ts`。这次的店名问题是展示，不是放宽谁能操作哪家店。
- 改完用同一批截图路径回归：1440 下老板走一遍看板、财务、会员详情（冻结、退款、流水）、课程名单、设置；再用店长打开李越的详情，确认没有 `huanqiu`；390 和 768 下看会员页按钮和侧栏退出是否还在视口里。
