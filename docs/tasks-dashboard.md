# 门店管理后台（apps/dashboard）第一期任务

最后更新：2026-10-21。范围按 `docs/mvp-plan.md`（第一期含团课、私教、活动报名、保险投保、美团接入；第 9 节「已定（2026-10-21）」）。每个任务 20–40 分钟，做完跑 `pnpm typecheck` 和 `pnpm test`。

## 怎么跟后端并行

- 后台接口的契约写在 `packages/api/src/admin.ts`（`createAdminApi`），请求和返回的类型都在这里，后端照着实现。会员端的 `createApi` 不动。
- 后端没好之前，后台用 `apps/dashboard/src/api/mock/` 里的 mock adapter：同一个 `RequestAdapter` 接口，按路径返回内存数据，数据可以改（开卡、入场以后列表会变）。
- 没设 `VITE_API_BASE` 就走 mock；设了就走真后端。页面只调 `api.xxx()`，不知道是不是 mock。
- mock 里要判断规则的地方（能不能入场、扣几次）调用 `@climb/core`，不在 mock 或页面里另写一份。
- 每个任务「涉及文件」里列了契约要加的接口；新加接口时 mock 一起补，并给 mock 加一条单测。
- 标「等馆方」的任务先按原型的做法写，规则做成可配置或者集中在一处，馆方确认后再改。

## 任务列表

### A. 基础

**1. 后台接口契约和 mock 骨架**
- 依赖：无
- 涉及文件：`packages/api/src/admin.ts`、`packages/api/src/index.ts`、`apps/dashboard/src/api/index.ts`、`apps/dashboard/src/api/mock/*`、`apps/dashboard/package.json`（加 `test`）
- 内容：`createAdminApi` 先放员工登录、当前员工、门店列表、看板汇总；mock adapter（路径匹配、内存数据、模拟延迟、401/4xx）；后台的 `api` 实例按 `VITE_API_BASE` 选真后端或 mock。
- 完成标准：mock 单测覆盖登录成功/失败、没 token 返回 401、看板按门店过滤；typecheck、test 通过。

**1.5 字体加载和 favicon**
- 依赖：无
- 涉及文件：`packages/theme/src/fonts.css`、`packages/theme/src/index.ts`（`FONT_FAMILY`）、`packages/theme/package.json`、`gyms/benchmark/src/index.ts`、`gyms/benchmark/assets/favicon.png`、`apps/dashboard/src/main.ts`、`apps/dashboard/index.html`
- 内容：原型用 Google Fonts 加载 ZCOOL QingKe HuangYou（标题）和 Bricolage Grotesque（数字），应用里只写了字体名没加载，全部回退成系统字体。改用 `@fontsource/zcool-qingke-huangyou` 和 `@fontsource-variable/bricolage-grotesque`（opsz + wght），由 Vite 打包，不依赖 Google；ZCOOL 按 unicode-range 分片按需下载。字体模块放在 `@climb/theme/fonts.css`，两端共用 family 名；小程序不引这个 CSS。favicon 跟着岩馆走：`gyms/<岩馆>/assets/favicon.png`，由 prepare-gym 复制到 `/gym/`。
- 完成标准：dev 页面 `document.fonts` 里两个字体都是 loaded，标题和数字跟原型一致；`/gym/favicon.png` 返回 200，没有 favicon 404；typecheck、test 通过。

**2. 登录和会话** ✅
- 依赖：1
- 涉及文件：`src/pages/LoginPage.vue`、`src/session.ts`、`src/router.ts`、`src/App.vue`
- 内容：手机号 + 密码登录；token 存 localStorage（读写包 try/catch）；路由守卫，没登录跳登录页；401 时清 token 回登录页；侧栏底部显示员工名和退出。
- 完成标准：mock 账号能登录、刷新后还在、退出后回登录页；错误密码有提示。

**3. 角色权限和门店切换** ✅
- 依赖：2
- 涉及文件：`src/session.ts`、`src/router.ts`、`src/App.vue`、`src/permissions.ts`（+ 单测）
- 内容：`owner | manager | desk` 三种角色能看哪些页、能做哪些操作集中写在 `permissions.ts`；导航按角色过滤；顶部门店切换（「全部门店」只给能看多店的人），选中的门店存在会话里，各页面读它。
- 完成标准：desk 账号看不到财务、卡种与价格、员工；直接输地址也进不去；单测覆盖权限表。

**4. 后台通用组件（一）：表格和分页** ✅
- 依赖：无
- 涉及文件：`packages/ui-web/src/DataTable.vue`、`Pager.vue`、`index.ts`
- 内容：列定义、插槽、空状态、加载中；分页。只用主题 CSS 变量。
- 完成标准：在 TodoPage 临时挂一个示例能正常显示；typecheck 通过。

**5. 后台通用组件（二）：弹窗、表单、提示** ✅
- 依赖：无
- 涉及文件：`packages/ui-web/src/Modal.vue`、`Field.vue`、`Toast.vue`（或 `useToast`）、`ConfirmButton.vue`
- 内容：弹窗（Esc 关闭、提交中禁用）；表单项（标签、必填、错误文案）；成功/失败提示；需要填原因的确认按钮（撤销、调整、退款都用）。
- 完成标准：组件可用，键盘能操作；typecheck 通过。

### B. 数据看板

**6. 看板首屏接接口** ✅
- 依赖：1、3
- 涉及文件：`src/pages/DashboardPage.vue`、mock
- 内容：用 `admin.dashboard({ store })` 替换示例数字：本月营收、今日入场（对比上周同日同时段）、今日约课、有效会员；跟着门店切换刷新。
- 完成标准：切门店数字变化；加载和出错有状态。

**7. 看板：新客从哪来、老带新转化** ✅
- 依赖：6
- 涉及文件：`packages/api/src/admin.ts`（`DashboardSummary` 补字段）、`DashboardPage.vue`、mock
- 内容：本月新客按来源（walkin / referral / gift / platform(美团) / legacy_import）分，含其中办卡人数；老带新发出、领取、到店、转化办卡。
- 完成标准：数字与 mock 数据一致（mock 单测）；用 `@climb/ui-web` 组件，不写死颜色。

**8. 看板：7 天内到期、门店对比** ✅
- 依赖：6
- 涉及文件：同上
- 内容：7 天内到期的卡列表（点进会员详情）；选「全部门店」时显示三店对比（营收、入场、新客）。
- 完成标准：只有多店权限能看到门店对比。

**9. 财务页**
- 依赖：3、4
- 涉及文件：`src/pages/FinancePage.vue`、契约 `GET /admin/finance?from=&to=&store=`、mock
- 内容：按日期范围、门店看营收，按渠道（微信、现金、POS、转账、美团）和品类（期限卡、次卡、单次票、私教、团课、活动）分；退款单列。只有 owner/manager。
- 完成标准：合计 = 分项之和（mock 单测）；金额全部用「分」计算，展示用 `formatYuan`。

### C. 会员和卡

**10. 会员列表和搜索**
- 依赖：3、4
- 涉及文件：`src/pages/MembersPage.vue`、契约 `GET /admin/members?q=&page=`、mock
- 内容：按手机号、名字搜；列表显示手机号（脱敏到中间四位）、来源、首次到店、有效卡数、最近入场。
- 完成标准：搜索、分页能用；空结果有提示。

**11. 会员详情：信息和卡**
- 依赖：10
- 涉及文件：`src/pages/MemberDetailPage.vue`、`src/router.ts`、契约 `GET /admin/members/:id`、mock
- 内容：基本信息、告知书签署状态、卡列表（剩余次数、有效期、状态：正常/冻结/作废/已退款）、最近订单、最近入场。
- 完成标准：从列表和看板到期列表都能进来；卡的展示文字跟小程序一致。

**12. 卡流水**
- 依赖：11
- 涉及文件：`MemberDetailPage.vue`（或 `CardLedgerDrawer.vue`）、契约 `GET /admin/cards/:id/ledger`、mock
- 内容：每一笔变化：时间、原因（中文）、变化量、变化后剩余/到期、操作人、备注。
- 完成标准：mock 里最后一笔的剩余 = 卡上的剩余（mock 单测）。

**13. 新建会员（建档）**
- 依赖：5、10
- 涉及文件：`src/components/MemberForm.vue`、契约 `POST /admin/members`、mock
- 内容：手机号必填、名字、来源；手机号已存在时提示并跳到那个人。
- 完成标准：重复手机号返回 409，页面给出跳转。

**14. 线下收款开卡**
- 依赖：5、11
- 涉及文件：`src/components/DeskOrderModal.vue`、契约 `POST /admin/orders`、mock
- 内容：选会员（或当场建档）、选卡种、收款方式（现金/POS/转账）、实收金额（默认标价，改了要写原因），提交后发卡。
- 完成标准：mock 里生成订单、卡和一笔 `purchase` 流水；会员详情马上能看到。

**15. 手动登记入场**
- 依赖：11
- 涉及文件：`src/components/DeskCheckInModal.vue`、契约 `POST /admin/check-ins/preview`、`POST /admin/check-ins`、mock
- 内容：给手机没电的会员登记：选门店、列出能用的卡（mock 用 `@climb/core` 判断）、确认；同日再次入场不扣次；没签告知书的提示前台让会员补签。
- 完成标准：mock 单测：同一天第二次 `deducted = 0`；带幂等键重复提交不重复扣。

**16. 撤销入场**
- 依赖：5、15
- 涉及文件：入场记录页和会员详情、契约 `POST /admin/check-ins/:id/void`、mock
- 内容：必须填原因；次卡退回 1 次（流水 `check_in_void`）；已撤销的显示撤销人和原因；对应保单标记要退保（见 33）。
- 完成标准：撤销后剩余次数恢复（mock 单测）。

**17. 调整次数、有效期，冻结和解冻**
- 依赖：5、12
- 涉及文件：`src/components/CardAdjustModal.vue`、契约 `POST /admin/cards/:id/adjust`、`POST /admin/cards/:id/freeze`、`/unfreeze`、mock
- 内容：调次数、改到期日必须写原因；期限卡冻结（天数上限、每年次数先做成岩馆配置，等馆方）；解冻后顺延到期日。只有 manager 以上能调。
- 完成标准：每次操作有流水；冻结中的卡不能入场（规则在 `@climb/core`，如缺规则先在 core 补并加单测，跟 core 负责人对一下）。

**18. 退款**
- 依赖：5、11
- 涉及文件：`src/components/RefundModal.vue`、契约 `POST /admin/orders/:id/refund`、mock
- 内容：选订单、退款金额（不超过实付减已退）、原因；微信订单走原路退，线下订单只记录；卡改成已退款。用过一部分的折算规则等馆方，先手填金额。
- 完成标准：超额退款被拦（mock 返回 422）；只有 manager 以上可见。

### D. 卡种、记录、员工

**19. 卡种与价格**
- 依赖：4、5
- 涉及文件：`src/pages/ProductsPage.vue`、契约 `GET/POST/PATCH /admin/products`、mock
- 内容：按品类（期限卡、次卡、单次票、私教课包、团课包）列出；新建、改价、改卖点、上下架、排序。改价不影响已卖出的订单（订单存快照）。
- 完成标准：下架的卡种在小程序接口 `GET /products` 里消失（mock 共用一份数据）。

**20. 入场记录**
- 依赖：4、3
- 涉及文件：`src/pages/EntriesPage.vue`、契约 `GET /admin/check-ins?date=&store=`、mock
- 内容：按日期、门店看；每条显示会员、卡、扣次、方式（扫码/前台登记）、是否投保、是否撤销；入口能撤销（16）。
- 完成标准：跟门店切换联动；撤销的记录有标记。

**21. 分享记录**
- 依赖：4
- 涉及文件：`EntriesPage.vue` 的分享 tab、契约 `GET /admin/shares`、mock
- 内容：次卡转赠、老带新：发起人、领取人、次数、状态（待领取/已领取/已使用/已退回）、到期。
- 完成标准：状态文字和小程序一致。

**22. 员工账号**
- 依赖：3、5
- 涉及文件：`src/pages/StaffPage.vue`、契约 `GET/POST/PATCH /admin/staff`、mock
- 内容：新增员工（手机号、名字、角色、可操作门店、初始密码）、停用、重置密码；教练也是员工（私教用，见 28）。只有 owner。
- 完成标准：停用的账号登录失败（mock 单测）。

**23. 操作日志**
- 依赖：4
- 涉及文件：`src/pages/AuditPage.vue`、契约 `GET /admin/audit-logs`、mock
- 内容：改价、调整、退款、撤销入场、员工变更：谁、什么时候、改前改后。只读。
- 完成标准：做过 14–18 的操作都能在这里查到。

**24. 导出 Excel**
- 依赖：10、20
- 涉及文件：`src/components/ExportButton.vue`、契约 `GET /admin/exports/:kind`、mock
- 内容：会员、卡、订单、入场记录按当前筛选导出；后端生成文件返回下载地址，mock 直接在前端生成 CSV。
- 完成标准：下载的文件 Excel 打开中文不乱码。

### E. 团课

**25. 团课课程种类**
- 依赖：4、5
- 涉及文件：`src/pages/CoursesPage.vue`（团课 tab）、契约 `GET/POST/PATCH /admin/class-types`、mock
- 内容：课程名、时长、人数上限、默认教练、消耗（团课次数卡 1 次或单节价）。等馆方：候补、取消和迟到规则，先做成字段。
- 完成标准：能新建、编辑、停用。

**26. 团课排期和发布**
- 依赖：25
- 涉及文件：`src/components/ClassSchedule.vue`、契约 `GET/POST/PATCH /admin/classes?week=&store=`、mock
- 内容：按门店、按周看课表；加一节课（课程、时间、教练、人数上限）；复制上周课表；取消一节课（已约的人退次数，写原因）。
- 完成标准：发布后小程序约课接口能看到（mock 共用数据）。

**27. 团课名单和签到**
- 依赖：26
- 涉及文件：`src/components/ClassRoster.vue`、契约 `GET /admin/classes/:id/bookings`、`POST /admin/bookings/:id/attend`、`/cancel`、mock
- 内容：已约名单、候补、签到、帮会员取消；看板「今日约课」用这里的数。
- 完成标准：取消后次数退回，有流水。

### F. 私教

**28. 教练资料**
- 依赖：22
- 涉及文件：`StaffPage.vue` 的教练字段、契约补 `coach` 字段、mock
- 内容：员工里标记教练：头像、简介、单节价、可约门店。提成规则等馆方，先不做计算。
- 完成标准：小程序约私教列表能拿到教练。

**29. 私教时间轴**
- 依赖：28
- 涉及文件：`CoursesPage.vue` 私教 tab、`src/components/CoachTimeline.vue`、契约 `GET /admin/pt-slots?from=&to=&store=`、mock
- 内容：照原型：每位教练一行，10:00–23:00 每小时一格，可切 7 天；格子显示空闲、会员约的、线下约的、不接课。
- 完成标准：营业时间从 `gym` 配置读，不写死。

**30. 私教预约处理**
- 依赖：29
- 涉及文件：`CoachTimeline.vue`、契约 `POST /admin/pt-slots`（标记线下约/不接课）、`POST /admin/pt-bookings/:id/confirm`、`/cancel`、mock
- 内容：点空格标记线下约的；会员约的要不要教练确认等馆方，先做成岩馆配置；取消退课时，有冲突拦下。
- 完成标准：同一教练同一时段不能约两次（规则写在 `@climb/core`，单测）。

### G. 活动报名

**31. 活动列表和发布**
- 依赖：4、5
- 涉及文件：`src/pages/EventsPage.vue`、契约 `GET/POST/PATCH /admin/events`、mock
- 内容：标题、门店、时间、人数上限、价格（0 = 免费）、报名要填的信息（自定义几个字段）、封面；发布、截止报名、取消（已付款的退款走 18）。
- 完成标准：发布后小程序能看到；满员后显示已满。

**32. 活动报名名单**
- 依赖：31
- 涉及文件：`src/components/EventRoster.vue`、契约 `GET /admin/events/:id/registrations`、mock
- 内容：名单、填的信息、付款状态、签到；导出（复用 24）；活动带来的新客数。
- 完成标准：名单和小程序报名一致。

### H. 保险

**33. 投保记录**
- 依赖：20
- 涉及文件：`src/pages/InsurancePage.vue`、契约 `GET /admin/insurance-policies?date=&store=`、mock
- 内容：每次入场一条保单：会员（身份证脱敏）、门店、日期、状态（投保中/成功/失败/已退保）、保单号、保费；当天合计保费。
- 完成标准：同一人同一天只有一张保单；撤销入场的显示已退保或待退保。

**34. 投保失败处理**
- 依赖：33
- 涉及文件：`InsurancePage.vue`、契约 `POST /admin/insurance-policies/:id/retry`、mock
- 内容：失败的置顶标红，能重试；看板上提示「今天有 N 单投保失败」。保险公司是接口还是每天交名单等馆方，如果是交名单，这里改成「导出今日投保名单」。
- 完成标准：重试成功后状态变化。

### I. 美团 / 大众点评

**35. 团购券核销**
- 依赖：15
- 涉及文件：`src/components/MeituanVerifyModal.vue`、契约 `POST /admin/meituan/prepare`（查券）、`POST /admin/meituan/verify`、mock
- 内容：前台输入或扫券码 → 显示套餐名、份数 → 核销 → 按套餐对应的卡种给会员发卡或直接登记入场；会员没有档案的当场建档，来源记 `platform`。
- 完成标准：同一张券不能核销两次（mock 返回 409）。

**36. 美团套餐映射和核销记录**
- 依赖：19、35
- 涉及文件：`ProductsPage.vue` 的美团 tab、契约 `GET/PUT /admin/meituan/deals`、`GET /admin/meituan/verifications`、mock
- 内容：美团套餐 → 我们的卡种的对应关系；核销记录（券码、套餐、会员、门店、员工、时间），撤销核销。财务页把美团单列（9）。
- 完成标准：没配映射的套餐核销时提示先配置。

### J. 前台平板和迁移

**37. 前台平板页：动态入场码**
- 依赖：1
- 涉及文件：`src/pages/DeskPage.vue`（不带侧栏的独立路由 `/desk`）、契约 `GET /desk/qr`、mock
- 内容：设备绑定门店后全屏显示二维码，每 30 秒换一次，显示倒计时和门店名；断网时提示。
- 完成标准：码按时刷新；离开页面停止轮询。

**38. 前台平板页：实时入场列表**
- 依赖：37
- 涉及文件：`DeskPage.vue`、契约 `GET /desk/feed?since=`、mock
- 内容：右侧显示刚入场的人：头像、名字、用的卡、是否首次（首次的高亮，提醒前台讲安全）。先轮询，后端有推送再换。
- 完成标准：mock 里手动登记一次入场，平板列表几秒内出现。

**39. 青橙导入：上传和进度**
- 依赖：5
- 涉及文件：`src/pages/ImportPage.vue`、契约 `POST /admin/imports`、`GET /admin/imports/:id`、mock
- 内容：上传青橙导出的 Excel，显示处理进度和统计（会员数、卡数、失败行）。只有 owner。
- 完成标准：mock 能模拟处理中 → 完成。

**40. 青橙导入：对账报告**
- 依赖：39
- 涉及文件：`ImportPage.vue`、`src/components/ReconcileTable.vue`
- 内容：每个会员一行：青橙的剩余次数/到期日 vs 导入后的，不一致标红，可筛只看不一致；可导出。影子运行期间每天看这一页。
- 完成标准：mock 里故意放几条不一致的，能筛出来。

### K. 收尾

**41. 按岩馆打包和走查**
- 依赖：全部
- 涉及文件：无新文件
- 内容：`pnpm build:gym benchmark` 通过；用 owner、manager、desk 三个 mock 账号把原型里后台相关的演示路线走一遍，记下差异。
- 完成标准：走查清单里没有阻塞问题。

## 依赖关系一览

```
1 → 2 → 3 ─┬→ 6 → 7, 8
           ├→ 9, 10 → 11 → 12, 13, 14, 15 → 16, 35
           └→ 20, 22 → 28 → 29 → 30
4, 5 → 大部分列表和弹窗
25 → 26 → 27    31 → 32    33 → 34    35 → 36    37 → 38    39 → 40
```

建议顺序：1–5 → 6、10–16（前台每天要用的）→ 19–24 → 团课、私教、活动 → 保险、美团 → 平板页、导入 → 41。
