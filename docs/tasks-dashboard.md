# 门店管理后台（apps/dashboard）第一期任务

最后更新：2026-10-21。范围按 `docs/mvp-plan.md`（第一期含团课、私教、活动报名、保险投保、美团接入；第 9 节「已定（2026-10-21）」）。每个任务 20–40 分钟，做完跑 `pnpm typecheck` 和 `pnpm test`。

## 怎么跟后端并行

- 后台接口的契约写在 `packages/api/src/admin.ts`（`createAdminApi`），请求和返回的类型都在这里，后端照着实现。会员端的 `createApi` 不动。
- 后端没好之前，后台用 `apps/dashboard/src/api/mock/` 里的 mock adapter：同一个 `RequestAdapter` 接口，按路径返回内存数据，数据可以改（开卡、入场以后列表会变）。
- 没设 `VITE_API_BASE` 就走 mock；设了就走真后端。页面只调 `api.xxx()`，不知道是不是 mock。
- mock 里要判断规则的地方（能不能入场、扣几次）调用 `@climb/core`，不在 mock 或页面里另写一份。
- 每个任务「涉及文件」里列了契约要加的接口；新加接口时 mock 一起补，并给 mock 加一条单测。
- 标「等馆方」的任务先按原型的做法写，规则做成可配置或者集中在一处，馆方确认后再改。2026-10-21 已定的（撤销入场、期限卡冻结、扫码入场）已经从下面的任务里去掉「等馆方」；还没定的权限（谁能改价、多店员工能不能看汇总）继续用 `permissions.ts` 里的可配置占位。

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
- 内容：`owner | manager | desk` 三种角色能看哪些页、能做哪些操作集中写在 `permissions.ts`（谁能改价、多店员工能不能看汇总还在讨论，表里是占位，定了只改这张表）；导航按角色过滤；顶部门店切换（「全部门店」只给能看多店的人），选中的门店存在会话里，各页面读它。
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
- 完成标准：只有多店权限能看到门店对比。（多店员工能不能看汇总还在讨论，按 `permissions.ts` 的占位）

**9. 财务页** ✅
- 依赖：3、4
- 涉及文件：`src/pages/FinancePage.vue`、契约 `GET /admin/finance?from=&to=&store=`、mock
- 内容：按日期范围、门店看营收，按渠道（微信、现金、POS、转账、美团）和品类（期限卡、次卡、单次票、私教、团课、活动）分；退款单列。只有 owner/manager。
- 完成标准：合计 = 分项之和（mock 单测）；金额全部用「分」计算，展示用 `formatYuan`。

### C. 会员和卡

**10. 会员列表和搜索** ✅
- 依赖：3、4
- 涉及文件：`src/pages/MembersPage.vue`、契约 `GET /admin/members?q=&page=`、mock
- 内容：按手机号、名字搜；列表显示手机号（脱敏到中间四位）、来源、首次到店、有效卡数、最近入场。
- 完成标准：搜索、分页能用；空结果有提示。

**11. 会员详情：信息和卡** ✅
- 依赖：10
- 涉及文件：`src/pages/MemberDetailPage.vue`、`src/router.ts`、契约 `GET /admin/members/:id`、mock
- 内容：基本信息、告知书签署状态、卡列表（剩余次数、有效期、状态：正常/冻结/作废/已退款）、最近订单、最近入场。
- 完成标准：从列表和看板到期列表都能进来；卡的展示文字跟小程序一致。

**12. 卡流水** ✅
- 依赖：11
- 涉及文件：`MemberDetailPage.vue`（或 `CardLedgerDrawer.vue`）、契约 `GET /admin/cards/:id/ledger`、mock
- 内容：每一笔变化：时间、原因（中文）、变化量、变化后剩余/到期、操作人、备注。
- 完成标准：mock 里最后一笔的剩余 = 卡上的剩余（mock 单测）。

**13. 新建会员（建档）** ✅
- 依赖：5、10
- 涉及文件：`src/components/MemberForm.vue`、契约 `POST /admin/members`、mock
- 内容：手机号必填、名字、来源；手机号已存在时提示并跳到那个人。
- 完成标准：重复手机号返回 409，页面给出跳转。

**14. 线下收款开卡** ✅
- 依赖：5、11
- 涉及文件：`src/components/DeskOrderModal.vue`、契约 `POST /admin/orders`、mock
- 内容：选会员（或当场建档）、选卡种、收款方式（现金/POS/转账）、实收金额（默认标价，改了要写原因），提交后发卡。
- 完成标准：mock 里生成订单、卡和一笔 `purchase` 流水；会员详情马上能看到。
- 补（2026-10-21）：次卡、课包到期日跟小程序对齐，含开卡当天（`addMonths(今天, validMonths)` 前一天）；没填 validMonths 的单次票（quantity 1）当天有效，`DEFAULT_VALID_MONTHS` 只给 quantity > 1 的用。谁能改价仍是占位（`order.create`）。

**15. 手动登记入场** ✅
- 依赖：11
- 涉及文件：`src/components/DeskCheckInModal.vue`、契约 `POST /admin/check-ins/preview`、`POST /admin/check-ins`、mock
- 内容：给手机没电的会员登记：选门店、列出能用的卡（mock 用 `@climb/core` 判断）、确认；同日再次入场不扣次；没签告知书的提示前台让会员补签。
- 完成标准：mock 单测：同一天第二次 `deducted = 0`；带幂等键重复提交不重复扣。
- 补（2026-10-21）：每次入场含保险，一人一天一张保单（`@climb/core` 的 `insuranceForEntry`）：当天第一次入场新投一张 `pending`，同日再次入场复用；待退保、已退保的不算，撤销后再入场新投。预览和结果带保险状态。撤销后标记待退保留给 16/33。

**16. 撤销入场** ✅
- 依赖：5、15
- 涉及文件：入场记录页和会员详情、契约 `POST /admin/check-ins/:id/void`、`src/permissions.ts`（`checkIn.void`）、mock
- 内容：已定前台可以撤销（前台、店长、老板都能），扫码入场和前台登记的都能撤；必须填原因；次卡退回 1 次（流水 `check_in_void`）；已撤销的显示撤销人和原因；对应保单标记要退保（见 33）。
- 完成标准：撤销后剩余次数恢复（mock 单测）。
- 补（2026-10-21）：规则在 `@climb/core` 的 `voidCheckIn`：只退这次实际扣的次数（同日再次入场扣 0 的不退）；撤销扣了次的那次而同一天还有免扣再进的（次卡），不退，扣次转给最早那次（另一张卡就这张退、那张扣）；用掉的体验券在同一天没有别的入场时才恢复；撤销的是投保那次而同一天还有没撤销的入场，保单改挂到那次，否则待退保；重复撤销返回第一次的结果。页面先放在会员详情「最近入场」，入场记录页（20）做的时候复用接口。操作日志等 23。

**17. 调整次数、有效期，冻结和解冻** ✅
- 依赖：5、12
- 涉及文件：`src/components/CardAdjustModal.vue`、契约 `POST /admin/cards/:id/adjust`、`POST /admin/cards/:id/freeze`、`/unfreeze`、mock
- 内容：调次数、改到期日必须写原因；后台帮会员冻结、解冻期限卡，按 17.5 的冻结规则校验（超出次数或天数的拦下，店长以上可以写原因破例）；解冻后按实际冻结天数顺延到期日。只有 manager 以上能调。
- 完成标准：每次操作有流水；冻结中的卡不能入场；会员在小程序自助冻结的卡，后台能看到并能提前解冻（规则在 `@climb/core`，如缺规则先在 core 补并加单测，跟 core 负责人对一下）。
- 补（2026-10-21）：规则在 core 的 `cardAdjust.ts`：`adjustCard`（原因必填；作废、退款的不能改；剩余超过总数的总数跟着加；期限卡改到期日后面续的卡跟着挪，已经开始用的拦下）、`deskFreezeCheck` / `deskFreezePeriodCard`（不看 `memberSelfService`；超每月、每年次数或天数上下限的要 `overrideReason`，破例也不能超过 `FREEZE_DAYS_LIMIT`；冻结和挪卡直接调 `freezePeriodCard`）、`freezeHistory`（会员所有卡上的 freeze 流水，后台代办的也算）。解冻直接用 `unfreezePeriodCard`。`freeze.ts` 只加了导出 `followersAfter`，原有行为没动。破例权限 `card.freezeOverride`（店长以上）。接口多一个 `GET /admin/cards/:id/freeze` 给弹窗看规则和剩余次数；mock 每次请求前跑 `settleFreeze`。示例数据里那张冻结的次卡不是期限卡，解冻不了（等青橙导入时看实际有没有这种卡）。

**17.5 冻结规则配置** ✅
- 依赖：3、5
- 涉及文件：`src/pages/SettingsPage.vue`（或卡种页的「冻结规则」tab）、`packages/core/src/gym.ts`（`GymRules` 加冻结规则）、`packages/core/src/rules.ts`（+ 单测）、`gyms/benchmark/src/index.ts`、契约 `GET/PUT /admin/settings/freeze-rules`、mock
- 内容：已定会员可以在小程序里自己冻结期限卡，规则由岩馆在后台配：每月最多几次、每年最多几次（可不限）、每次最少/最多几天、会员能不能自助（关掉就只能前台办）。默认会员每月可自助冻结 1 次，其他先给占位值。规则判断（这次能不能冻、冻几天、解冻后到期日）只写在 `@climb/core`，小程序和后台共用。只有 owner（店长能不能改等定了权限再说）。
- 完成标准：改了配置后小程序冻结接口按新规则拦（mock 共用一份数据）；core 单测覆盖每月次数、每年次数、天数上下限、跨月跨年。
- 补（2026-10-21）：`FreezeRules` / `defaultFreezeRules` 和 `freeze.ts` 跟小程序分支完全一致（`isPeriodActive` 也跟着改成要求状态正常，冻结中的卡不能入场、不能发老带新）；后台设置的校验在 core 的 `freezeRules.ts`（`freezeRulesErrors`，次数 1 以上或不限、每年不少于每月、天数 1–365 且最多不少于最少）。页面放在新的「设置」页（只有老板，权限 `settings.freezeRules`）；mock 存在 `db.rules.freezeRules`，小程序 mock 合并后要读同一份。`freezeBlockedBy` 先查 `memberSelfService`，后台帮冻（17）不能直接用它，要另包一层并支持店长写原因破例。

**18. 退款** ✅
- 依赖：5、11
- 涉及文件：`src/components/RefundModal.vue`、契约 `POST /admin/orders/:id/refund`、mock
- 内容：选订单、退款金额（不超过实付减已退）、原因；微信订单走原路退，线下订单只记录；卡改成已退款。用过一部分的折算规则等馆方，先手填金额。
- 完成标准：超额退款被拦（mock 返回 422）；只有 manager 以上可见。
- 补（2026-10-21）：规则在 core 的 `refund.ts`，等馆方的占位集中在文件开头：折算 `suggestedRefund`（次卡、课包按剩余次数/总次数，送出去的算用掉；期限卡按剩余天数/总天数，冻结过的天数用 `pastFrozenDays` 从解冻流水算出来、两边都不算，今天算剩余，冻结中的从冻结那天起算；不到 1 分舍掉；只是建议，前台可以改）；`planRefund`（金额大于 0、不超过实付减已退，处理中的也算已退；原因必填；按渠道 `REFUND_METHOD_BY_CHANNEL`：微信原路退先 processing，现金/POS/转账/青橙导入线下退当场 succeeded，美团不在这里退；卡改 refunded 不能再入场，次卡清零记 refund 流水，期限卡后面没开始的续卡往前挪；一个订单可以分几次退）；`orderStatus`（按退成功的算 paid/partially_refunded/refunded）。契约多一个 `GET /admin/orders/:id/refund` 给弹窗看建议金额；订单行加 `status`、`cardId`，财务退款行加 `method`。入口在会员详情「最近订单」。mock 微信退款当场模拟回调成功；真后端要接微信退款接口和回调。权限 `order.refund` 仍是占位（店长以上）。操作日志等 23。

### D. 卡种、记录、员工

**19. 卡种与价格** ✅
- 依赖：4、5
- 涉及文件：`src/pages/ProductsPage.vue`、契约 `GET/POST/PATCH /admin/products`、mock
- 内容：按品类（期限卡、次卡、单次票、私教课包、团课包）列出；新建、改价、改卖点、上下架、排序。改价不影响已卖出的订单（订单存快照）。
- 完成标准：下架的卡种在小程序接口 `GET /products` 里消失（mock 共用一份数据）。
- 补（2026-10-21）：规则在 core 的 `product.ts`，等馆方的占位（名称、卖点、标价、天数、次数、有效月数的上限）集中在文件开头：`newProductErrors` / `productPatchErrors` / `buildProduct` / `applyProductPatch`；品类和规格（天数、次数、有效月数）建好不能改，要换就新建、旧的下架；在售的不能重名；`productBlockedBy`（下架的不能买，前台开卡改用它）；`sortProducts`（按组 期限卡、次卡、单次票、私教、团课，组内按新加的 `Product.sort`，再按标价）、`productsForSale`（小程序 `GET /products`）。`shop.ts` 从小程序分支原样拷过来（单次票 = 1 次的次卡），小程序的 `groupProducts` 组内还是按价格排，合并后改用 `sortProducts`。权限新加 `product.price`（改价、新建都要，占位店长以上），别的改动是 `product.edit`。mock 加了不用登录的 `GET /products` 读同一份 `db.products`，小程序 mock 合并后要读同一份。已有订单和卡本来就存下单时的商品名、品类、标价，开好的卡不看卡种，所以改价、改名不影响；mock 单测覆盖。操作日志等 23。

**20. 入场记录** ✅
- 依赖：4、3
- 涉及文件：`src/pages/EntriesPage.vue`、契约 `GET /admin/check-ins?date=&store=`、mock
- 内容：按日期、门店看；每条显示会员、卡、扣次、方式（扫码/前台登记）、是否投保、是否撤销；入口能撤销（16，前台也能）。
- 完成标准：跟门店切换联动；撤销的记录有标记。
- 补（2026-10-21）：入场记录加 `policyId`（跟小程序分支的 `insuranceHistory.ts` 一样，按入场记录上的保单挂，不按日期猜），core 的 `insurance.ts` 加 `entryPolicy`；入场行（会员详情、入场记录、登记和撤销结果）都多了 `insurance: { policyId, status } | null`，没有保单记录的（上线前、导入的）为 null。示例入场按 `insuranceForEntry` 配了保单（以前的已投保，撤销的那条已退保）。门店口径同财务页（`storeScope`：只管部分门店的必须带自己的店）；`date` 不带是今天，用 utils 新加的 `isDateKey` 校验。撤销直接调 16 的接口，页面文字抽到 `components/checkInVoid.ts`，会员详情和入场记录页共用。先不分页；记录里没有入场时间，同一天按写入先后倒序（真后端按 `created_at`）。

**21. 分享记录** ✅
- 依赖：4
- 涉及文件：`EntriesPage.vue` 的分享 tab、契约 `GET /admin/shares`、mock
- 内容：次卡转赠、老带新：发起人、领取人、次数、状态（待领取/已领取/已使用/已退回）、到期。
- 完成标准：状态文字和小程序一致。
- 补（2026-10-21）：状态跟小程序分支 `referral.ts` 的 `ReferralRecordState` 同值同义：`pending | expired | claimed | used`，文字照小程序已发记录（等朋友领取 / 过期了，没人领 / 朋友领了，还没来 / 朋友来过了），放在 core 的 `shareRecord.ts`（`SHARE_RECORD_STATE_TEXT`、`shareRecordState`），次卡转赠和老带新共用；合并时小程序的 `referralRecords` 和页面里的 `STATE_TEXT` 改用这一份。全部由数据推导：没人领的过了 `expiresOn` 算过期（当天还有效）；领了的看领取人那张卡（体验券 `usedOn`、好友送的次卡 `remaining < total`），撤销入场退回后变回「领了还没来」。「已退回」没做成单独状态：次卡转赠过期没人领退不退回原卡还在等馆方（要问馆方 4），先显示「过期了，没人领」。门店按发起人的归属门店，口径同财务页（`storeScope`）；可按 `kind` 筛；不返回 token。mock 加了 `db.shares`（次卡转赠，领了的有好友送的次卡，送出、领取、入场流水对得上），老带新邀请补了 `expiresOn`（当月底）。页面是入场记录页的「分享」tab（`?tab=shares`），先不分页。

**22. 员工账号** ✅
- 依赖：3、5
- 涉及文件：`src/pages/StaffPage.vue`、契约 `GET/POST/PATCH /admin/staff`、mock
- 内容：新增员工（手机号、名字、角色、可操作门店、初始密码）、停用、重置密码；教练也是员工（私教用，见 28）。只有 owner。
- 完成标准：停用的账号登录失败（mock 单测）。
- 补（2026-10-22）：规则在 core 的 `staff.ts`（`StaffRole`、`STAFF_ROLE_TEXT` 从 api 挪过来）：`newStaffErrors` / `staffPatchErrors`（手机号规整后全馆唯一，停用的也占着；名字必填；角色三种；可操作门店要么全部门店（存空数组，沿用 `Staff.storeIds` 的约定），要么至少一家存在的店；密码 6–32 位，占位）、`staffChangeBlockedBy`（不能停用、降级自己；改完至少留一个在用的馆长）。重置密码走 `PATCH` 的 `password`，停用、启用走 `active`。mock 只存密码哈希（加盐 FNV-1a，只为不放明文，后端用 bcrypt / argon2），token 带版本号，停用、重置密码后旧 token 立即 401（改自己的密码也要重新登录）；停用的登录 403。每次改动写 `db.auditLogs`（`staff.create` / `staff.update` 只记改了的字段 / `staff.password_reset` 不记密码），字段照 `audit_logs` 表，留给 23。教练资料见 28。

**23. 操作日志** ✅
- 依赖：4
- 涉及文件：`src/pages/AuditPage.vue`、契约 `GET /admin/audit-logs`、mock
- 内容：改价、调整、退款、撤销入场、员工变更：谁、什么时候、改前改后。只读。
- 完成标准：做过 14–18 的操作都能在这里查到。
- 补（2026-10-22）：动作名、文字和写法在 core 的 `audit.ts`（`AuditLogEntry` 照 `audit_logs` 表，多了 `storeId`、`reason`；`auditDiff` 只留改了的字段，`auditSnapshot` 去掉 password / passwordHash / token / tokenVersion）。mock 的 `audit()` 扩成通用的，补上：线下收款开卡（标价、实收、改价原因）、前台登记入场、撤销入场（次数、保单改前改后，重复撤销不再记）、调整次数和有效期、冻结、解冻（卡改前改后，跟着挪的期限卡）、退款（订单和卡改前改后、退款单）、新建和修改卡种（改价、上下架）、员工变更，另外改冻结规则也记。系统自动解冻不进操作日志（卡流水里有）。门店：订单和入场按它的门店，卡按会员的归属门店，卡种、员工、设置为全馆（null）。查询 `GET /admin/audit-logs?store=&action=&page=`，最新的在前、每页 50；只读，改、删一律 405。权限占位：新页面 `audit` 店长以上；`canSeeAllAuditLogs`（老板都能看全部，别的角色要能看全部门店）才能不带门店查、看全馆的，否则只能按自己的店查。

**24. 导出 Excel** ✅
- 依赖：10、20
- 涉及文件：`src/components/ExportButton.vue`、契约 `GET /admin/exports/:kind`、mock
- 内容：会员、卡、订单、入场记录按当前筛选导出；后端生成文件返回下载地址，mock 直接在前端生成 CSV。
- 完成标准：下载的文件 Excel 打开中文不乱码。
- 补（2026-10-22）：接口改成 `POST /admin/exports/:kind`（要写操作日志，不用 GET），返回 `{ fileName, url, rows }`，mock 的 url 是 data: URL（在 mock adapter 里生成，不是在页面里）。筛选和门店权限直接调列表接口那套：会员、卡同会员列表的 `q`（卡是搜到的会员的全部卡），订单同财务页的 `from / to / store`（`financeScope`，按付款日，含青橙导入，没付款的不算），入场记录同 `GET /admin/check-ins`。CSV 用 utils 的 `toCsv`（UTF-8 BOM、CRLF、逗号引号换行转义、= + - @ 制表符开头的文字前加 '，纯数字不加），金额用 `centsToYuanText`（元两位小数）。手机号同会员列表打码，`member.fullPhone` 才给完整号码。权限占位：`data.export` 店长以上，每种导出另外要能看对应页面（订单要财务）；`member.fullPhone` 只给老板。每次导出写一条 `data.export` 操作日志（种类、筛选、行数、是否完整手机号）。按钮在会员页（会员、卡）、入场记录页、财务页（订单）。

### E. 团课

**25. 团课课程种类** ✅
- 依赖：4、5
- 涉及文件：`src/pages/CoursesPage.vue`（团课 tab）、契约 `GET/POST/PATCH /admin/class-types`、mock
- 内容：课程名、时长、人数上限、默认教练、消耗（团课次数卡 1 次或单节价）。等馆方：候补、取消和迟到规则，先做成字段。
- 完成标准：能新建、编辑、停用。
- 补（2026-10-22）：`ClassType`、`ClassSession`、`ClassBooking` 等类型从小程序分支 `classes.ts` 原样拷过来（只拷了类型，约课规则函数合并时整份用那边的），`GymRules.classRules` / `ClassRules` / `defaultClassRules` 和 `defineGym` 的合并写法照小程序 `gym.ts` 原样加。校验在新文件 core 的 `classTypes.ts`：时长、人数上限、扣次是正整数（上限是占位常量），启用的不能重名，默认教练要是在用的员工；`sessionFromType` 排课时拷课名、时长、人数上限、扣次、默认教练，停用的种类抛 `class-type-inactive`（给 26 用）；`classRulesErrors` 校验团课规则。接口 `GET/POST/PATCH /admin/class-types`（编辑要 `classType.edit`，占位店长以上），团课规则 `GET/PUT /admin/settings/class-rules`（改要 `settings.classRules`，占位只有老板）；新建、修改、停用、改规则都写操作日志。「单节价」小程序的 `ClassType` 没有这个字段，先不做。默认教练先从员工列表选（只有老板拿得到），教练列表等 28。

**26. 团课排期和发布** ✅
- 依赖：25
- 涉及文件：`src/components/ClassSchedule.vue`、契约 `GET/POST/PATCH /admin/classes?week=&store=`、mock
- 内容：按门店、按周看课表；加一节课（课程、时间、教练、人数上限）；复制上周课表；取消一节课（已约的人退次数，写原因）。
- 完成标准：发布后小程序约课接口能看到（mock 共用数据）。
- 补（2026-10-22）：`classes.ts` 和 `classes.test.ts` 整份从小程序分支原样拷过来（约课、取消、候补补位、`cancelSession`），为此 `LedgerReason` 加了 class_* / pt_*（文字同小程序）、流水 ref 加 `class_booking`、`RuleErrorCode` 加了团课的码、`types.ts` 转出 `LedgerReason`；拷来的测试里 `defineGym` 那行去掉了这边还没有的 `entryQrLink`。排课规则在新文件 core 的 `classSchedule.ts`：`planSession`（用 25 的 `sessionFromType` 拷贝；时间要在现在之后、当天 24:00 前结束；同教练、同门店时间重叠拦下）、`rescheduleSession`（已开始的不能改时间；人数上限不少于已约的，调大了用 `fillFromWaitlist` 补候补并扣次）、`staffCancelSession`（原因必填，直接调 `cancelSession`）、`copyWeek`（上周没取消的课挪一周，人数和教练照上周，教练停用了换默认教练；停用的种类、冲突、时间过了的跳过并给原因）、`classLedgerEntry`（class_book / class_void 流水）。接口 `GET /admin/classes?week=&store=`、`POST /admin/classes`、`PATCH /admin/classes/:id`、`POST /admin/classes/:id/cancel`、`POST /admin/classes/copy-week`；写的要 `class.schedule`（占位店长以上）且门店是自己能操作的，门店口径同财务页；每次操作写操作日志。课表就是 `db.classSessions`，排好即发布；mock 加了不用登录的 `GET /classes`（照小程序那边的筛选），小程序 mock 合并后读同一份 `classSessions` / `classBookings`。mock 的「现在」可以用 `db.clock` 固定。

**27. 团课名单和签到** ✅
- 依赖：26
- 涉及文件：`src/components/ClassRoster.vue`、契约 `GET /admin/classes/:id/bookings`、`POST /admin/bookings/:id/attend`、`/cancel`、mock
- 内容：已约名单、候补、签到、帮会员取消；看板「今日约课」用这里的数。
- 完成标准：取消后次数退回，有流水。
- 补（2026-10-22）：`classes.ts` 没动（跟小程序逐字一致），新规则放在 core 的 `classRoster.ts`：`classRoster`（约上的按先后、候补带位次、取消作废的放后）、`attendBooking`（booked → attended；超过 `classRules.lateGraceMinutes` 才到的用 `isLateForClass` 判成 absent，次数不退；可以直接标缺席，标错能在到课、缺席间改；开课前 `CLASS_CHECKIN_OPEN_MINUTES`（占位 30 分钟）起才能签）、`staffCancelBooking`（原因必填，其余直接调 `cancelBooking({ by: 'staff' })`：越过自助截止、退次 class_cancel、候补递补扣次 class_book；开课后不能取消）、`classBookingsOn`（看板「今日约课」：今天没取消的课里 booked / attended / absent 的人次，私教等 29–30）。接口 `GET /admin/classes/:id/bookings`、`POST /admin/bookings/:id/attend`（`present`）、`/cancel`（`reason`）；按课的门店查员工能不能操作；权限占位 `class.attend`、`class.cancelBooking` 先都能；签到、取消写操作日志。mock 的预约多记签到时间和员工（`MockClassBooking`，`ClassBooking` 本身不加字段）；示例数据给这周每节课约了 3 人（课包、流水对得上），看板的「今日约课」不再用写死的示例数。

### F. 私教

**28. 教练资料** ✅
- 依赖：22
- 涉及文件：`StaffPage.vue` 的教练字段、契约补 `coach` 字段、mock
- 内容：员工里标记教练：头像、简介、单节价、可约门店。提成规则等馆方，先不做计算。
- 完成标准：小程序约私教列表能拿到教练。
- 补（2026-10-22）：教练就是员工，员工账号上多一份 `coach`（core 的 `coach.ts` 的 `CoachProfile`：tags、bio、avatarUrl、priceCents、storeIds），教练 id 用员工 id，手机号用员工账号的（小程序按手机号认教练本人）。小程序 `GET /coaches?store=` 返回的字段跟小程序分支 `@climb/api` 的 `Coach` 一样（id、name、tags、bio、storeIds），`Coach` 接口和 `createApi().coaches.list` 也加到了这边的 `@climb/api`。规则：可约门店至少一家、要存在、必须是员工能操作的店的子集（全部门店的随便选），改员工能操作的店时超出的也拦；单节价正整数分；停用的员工不出现在列表里（`listCoaches`，列表里只露出还在员工范围内的可约门店）；提成不算。新建、修改员工时带 `coach`（null 去掉），写在 `staff.update` 操作日志里。`GET /admin/coaches` 给后台选教练（课程默认教练、排课），登录的员工都能看，课程页改用它。占位：标签最多 5 个、简介 200 字、单节价最多 1 万元、头像先填 https 链接（上传等对象存储）。头像、单节价小程序的 `Coach` 还没有，先只在后台。示例：店长阿凯和 Max（只做教练的员工，手机号同小程序示例教练）有教练资料。

**29. 私教时间轴** ✅
- 依赖：28
- 涉及文件：`CoursesPage.vue` 私教 tab、`src/components/CoachTimeline.vue`、契约 `GET /admin/pt-slots?from=&to=&store=`、mock
- 内容：照原型：每位教练一行，10:00–23:00 每小时一格，可切 7 天；格子显示空闲、会员约的、线下约的、不接课。
- 完成标准：营业时间从 `gym` 配置读，不写死。
- 补（2026-10-22）：`pt.ts`、`pt.test.ts` 从小程序分支原样拷过来（拷来的测试里 `defineGym` 那行去掉了这边还没有的 `entryQrLink`），`gym.ts` 的 `PtRules` / `defaultPtRules` / `GymRules.ptRules` 和 `defineGym` 的合并、`rules.ts` 的 pt-* 错误码照小程序原样加（pt_* 流水原因在 26 已经加了），流水 ref 加 `pt_booking`。只读视图在新文件 core 的 `ptTimeline.ts`：`ptTimeline`（每位教练一行、每天一列，格子用 `ptDaySlots`，营业时间来自 `ptRules`，挂上预约和标记）、`ptRangeError`（一次最多 7 天）、`ptBookingsOn`（看板「今日约课」现在也算今天占着格子的私教）。接口 `GET /admin/pt-slots?from=&to=&store=`（from 默认今天、to 默认往后 6 天），门店口径同财务页，教练按 `listCoaches` 在这家店接私教的；会员约的格子带会员名字。mock 加了 `db.ptBookings` / `db.ptSlotMarks`（结构同小程序的 PtBooking / PtSlotMark，示例照小程序：Max 明天 14 点会员约、15 点线下约小王、19 点不接课，店长阿凯后天 10 点不接课，昨天 18 点上完一节；课包和流水对得上）。页面在课程排期页「私教」，可切 7 天。

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
- 内容：已定入场方式：会员用微信扫平板上的动态码，直接进小程序签到页。设备绑定门店后全屏显示二维码（普通二维码跳转小程序，或小程序码，两种都留着，由 `GET /desk/qr` 返回用哪种），码里带门店和一次性 token；每 30 秒换一次，token 用过一次或过期就失效；显示倒计时和门店名；断网时提示。
- 完成标准：码按时刷新；同一个 token 第二次签到被拒（mock 单测）；离开页面停止轮询。

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
           ├→ 17.5 → 17
           ├→ 9, 10 → 11 → 12, 13, 14, 15 → 16, 35
           └→ 20, 22 → 28 → 29 → 30
4, 5 → 大部分列表和弹窗
25 → 26 → 27    31 → 32    33 → 34    35 → 36    37 → 38    39 → 40
```

建议顺序：1–5 → 6、10–16、17.5、17（前台每天要用的）→ 19–24 → 团课、私教、活动 → 保险、美团 → 平板页、导入 → 41。
