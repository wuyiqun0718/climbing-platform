# 会员小程序第一期任务拆分（apps/miniapp）

最后更新：2026-10-21。范围按 `docs/mvp-plan.md` 第 1 节（含 2026-10-21 扩大的团课、私教、活动报名、保险、美团）和第 9 节「已定（2026-10-21）」。页面和交互照 `prototype/` 做。

## 怎么用这份清单

- 每个任务 20–40 分钟，做完能单独提交；按编号顺序做，「依赖」写的是必须先做完的任务。
- **后端还没写**。所有接口都走 `@climb/api`；后端没好之前，小程序用 `src/mock/` 里的 mock 适配器（任务 1）。mock 只模拟接口，业务规则照样调 `@climb/core`，不在 mock 或页面里另写一份。
- **接口契约**：`@climb/api` 现在只有卡种、卡包、入场、分享几个接口。小程序要用的其他接口按 `docs/mvp-plan.md` 第 6 节的路径，在对应任务里先加到 `packages/api/src/index.ts` 的会员端部分（只加方法和类型，不动后台的部分），再在 mock 里实现。后台分支（mvp/dashboard）也在改这个文件，合并时注意冲突。
- 新的业务规则（冻结、团课取消、私教时段冲突……）先在 `@climb/core` 加函数和单测，再在页面里用。
- 通用完成标准（每个任务都要满足，下面不再重复）：`pnpm typecheck`、`pnpm test` 通过；新页面在 `pnpm dev:h5` 里能走通；文案简体中文、口语；颜色只用主题变量；组件按 `.vue` 路径引入。
- 标 ⏸ 的任务等馆方确认（`docs/mvp-plan.md` 第 9 节「要问馆方」），先按原型的占位规则做，规则集中放在 `gyms/benchmark` 的配置或 `@climb/core` 里，确认后只改一处。
- 卡有 `status`（`normal`/`frozen`/`void`/`refunded`，不填算 `normal`）：只有 `normal` 的卡能入场、转赠、发老带新，`@climb/core` 已经拦了，页面上只负责显示状态。
- 谁能改价、多店员工能不能看汇总还在讨论，那是后台的事；小程序这边不涉及。

## A. 基础

| # | 任务 | 依赖 | 涉及文件 | 完成标准 |
|---|---|---|---|---|
| 1 ✅ | **mock 接口层**：按路由表实现一个 `RequestAdapter`，内存里放示例数据；先实现 `@climb/api` 现有的全部接口（卡种、卡包、入场、次卡转赠、老带新、领取），规则调 `@climb/core`；`VITE_API_BASE` 为空时自动用 mock | — | `apps/miniapp/src/mock/*`、`src/api.ts`、`src/env.d.ts`、`package.json`（加 test） | 单测覆盖：带 token 才能访问、入场扣次、同日再次入场不扣、转赠扣次和领取、不能领自己的、老带新名额；规则错误返回 4xx + `{ code }` |
| 1.5 ✅ | **字体加载修复**：标题 ZCOOL QingKe HuangYou、数字 Bricolage Grotesque 原来只写了名字没加载，全部回退成系统字体。H5 打包 `@fontsource` 的分片（主题里的 `Bricolage Grotesque` 用别名 `@font-face` 对上）；小程序在 `onLaunch` 用 `uni.loadFontFace({ global: true })` 加载子集 woff2，地址先用占位，等上传 COS 并加 downloadFile 合法域名；子集脚本可以重跑。不改 `packages/theme`（后台分支在那里加字体模块，合并时统一） | 1 | `src/main.ts`、`src/App.vue`、`src/styles/fonts.h5.css`、`src/config/fonts.ts`、`scripts/subset-fonts.mjs`、`scripts/fonts/display-text.txt`、`fonts/*.woff2`、`package.json` | H5 里 `document.fonts` 两个字体都是 loaded，标题和数字看着跟原型一样；body 不再是 Times；ZCOOL 子集几十 KB；小程序包里不含 fontsource 文件 |
| 2 ✅ | **mock 的会员切换和重置**：mock 里有两位示例会员（年卡阿杰、新客小鹿，和原型一致），开发时能切换当前身份、重置数据；数据存 `uni` 本地存储，刷新不丢 | 1 | `src/mock/db.ts`、`src/mock/dev-panel.vue` | H5 里切到小鹿能领阿杰发的分享；重置后回到初始数据 |
| 3 ✅ | **请求封装**：统一的 loading、错误提示（把 `ApiError.data.code` 翻成中文提示，表放在一个文件里）、401 时重新登录 | 1 | `src/api.ts`、`src/lib/request.ts`、`src/lib/errors.ts` | 规则错误在页面上提示成对应中文；单测覆盖错误码翻译 |
| 4 ✅ | **页面骨架和 tabBar**：首页、卡包、我的三个 tab；按原型建好空页面和路由；全局主题变量注入到 `page` | — | `src/pages.json`、`src/App.vue`、`src/pages/*` | 三个 tab 能切换，导航栏颜色来自主题 |
| 5 ✅ | **会员状态 store**：当前会员、卡包、告知书是否签过，启动时拉取，页面共享 | 1, 4 | `src/stores/member.ts` | 卡包改变（入场、领取、购卡）后各页面同步刷新 |

## B. 登录

| # | 任务 | 依赖 | 涉及文件 | 完成标准 |
|---|---|---|---|---|
| 6 ✅ | 契约 + mock：`POST /auth/wx-login`、`POST /auth/phone`、`GET /me` | 1 | `packages/api/src/index.ts`、`src/mock/routes/auth.ts` | mock 里手机号对上「青橙导入」的老会员时，老卡出现在卡包；有单测 |
| 7 ✅ | 登录流程：启动时 `uni.login` 换 token；第一次要手机号快速验证（`button open-type="getPhoneNumber"`），H5 下用输入框代替 | 3, 5, 6 | `src/App.vue`、`src/pages/login/*`、`src/lib/auth.ts` | 未登录访问需要登录的页面会先去登录，登录完回到原页面 |
| 8 ✅ | 隐私协议：首次登录前展示隐私说明并同意（小程序隐私保护指引） | 7 | `src/pages/login/*`、`src/manifest`（`__usePrivacyCheck__`） | 不同意不能登录；同意后不再弹 |

## C. 首页、卡包

| # | 任务 | 依赖 | 涉及文件 | 完成标准 |
|---|---|---|---|---|
| 9 ✅ | 首页：会员卡摘要、扫码入场大按钮、老带新/分享入口、今日团课、近期活动（后两块先占位） | 5 | `src/pages/index/index.vue`、`packages/ui-mp/*` | 和原型首页一致；没有卡时引导去购卡 |
| 10 ✅ | 卡包列表：期限卡、次卡、好友送的次卡、体验券、课时卡分组展示，过期/用完的折叠 | 5 | `src/pages/cards/index.vue`、`packages/ui-mp/MemberCard.vue` | 五种卡都能正确显示剩余次数/天数 |
| 11 ✅ | 契约 + mock + 页面：卡详情和使用记录 `GET /me/cards/:id/ledger` | 10 | `packages/api`、`src/mock/routes/cards.ts`、`src/pages/cards/detail.vue` | 入场、转赠、领取后流水里多一条，原因显示成中文 |
| 12 ✅ | 期限卡自助冻结（已定）：`@climb/core` 加冻结规则，规则由岩馆在后台配置，放进 `GymRules`（每月几次、每年几次、每次最少/最多几天；默认每月 1 次，其余先占位）；契约 + mock：冻结、提前解冻（卡 `status` 改 `frozen`/`normal`，到期日顺延冻结的天数，流水记 `freeze`/`unfreeze`）；卡详情里选天数冻结、提前解冻，冻结中显示到哪天 | 11 | `packages/core/src/rules.ts`、`packages/core/src/gym.ts`、`gyms/benchmark/src/index.ts`、`packages/api`、`src/mock/routes/cards.ts`、`src/pages/cards/detail.vue` | 核心规则有单测（次数用完、天数超限被拒）；冻结中的卡不能入场、不能发老带新（`status` 已在 core 里拦）；改岩馆配置不用改代码 |

## D. 购卡和支付

| # | 任务 | 依赖 | 涉及文件 | 完成标准 |
|---|---|---|---|---|
| 13 ✅ | 卡种列表页：期限卡、次卡、单次票、私教课包、团课课包，按类别分组，显示卖点（含「每次入场含当日保险」） | 4 | `src/pages/shop/index.vue` | 价格用 `formatYuan` 显示，数据来自 `GET /products` |
| 14 ✅ | 契约 + mock：`POST /orders`、`GET /orders/:id`、`GET /me/orders`；mock 下单后模拟「支付回调」再发卡 | 1 | `packages/api`、`src/mock/routes/orders.ts` | 单测：没「回调」前订单是 pending、卡包里没有新卡；回调后发卡且只发一次 |
| 15 ✅ | 下单和拉起支付：确认页 → `uni.requestPayment`；mock 下弹一个「模拟支付」确认；支付后轮询订单结果 | 13, 14 | `src/pages/shop/checkout.vue`、`src/lib/pay.ts` | 支付成功跳卡包能看到新卡；取消支付提示「订单还在，可以去订单里继续付」 |
| 16 ✅ | 订单记录页 | 14 | `src/pages/me/orders.vue` | 显示状态（待支付、已支付、已退款）和渠道（小程序、前台） |

## E. 扫码入场（含保险和告知书）

| # | 任务 | 依赖 | 涉及文件 | 完成标准 |
|---|---|---|---|---|
| 17 ✅ | 契约 + mock：`POST /check-ins/preview`（码里的门店 + 一次性 token → 门店 + 可用的卡，调 `entryOptions`）、`POST /check-ins` 带 token、幂等键和门店；token 入场成功后作废 | 1 | `packages/api`、`src/mock/routes/checkins.ts`、`packages/core`（入场带门店） | 单测：过期或用过的 token 被拒；同一个幂等键提交两次只入场一次；冻结中的卡不在可用列表里 |
| 18 ✅ | 扫码进签到页（已定）：会员用微信扫前台平板的动态码（普通二维码跳转小程序 / 小程序码），直接打开签到页，从启动参数（`q` 或 `scene`）里解析门店和 token；没登录先登录再回来。首页的扫码按钮用 `uni.scanCode` 兜底，解析同一套；H5 下用「模拟扫码」按钮选门店 | 7, 17 | `src/pages/checkin/scan.ts`、`src/pages/checkin/confirm.vue`、`src/pages.json`、`src/pages/index/index.vue` | 解析有单测（两种码、坏码）；扫到不是本馆的码给出提示；微信扫一扫和小程序内扫码进到同一个签到页 |
| 19 ✅ | 入场确认页：选卡（期限卡优先）、当日保险（标「卡里含」）、没卡时只能买单次票 | 17, 18 | `src/pages/checkin/confirm.vue` | 和原型一致；体验券在邀请人没入场时显示原因并禁用 |
| 20 ✅ | 契约 + mock + 页面：风险告知书 `POST /waivers`，第一次入场必须先勾选同意；告知书文本按版本取 | 19 | `packages/api`、`src/mock/routes/waivers.ts`、`src/pages/checkin/waiver.vue` | 签过一次以后不再出现；告知书换版本后要重签 |
| 21 | ⏸ 投保信息：第一次入场填身份证号（单独告知和同意，界面只显示脱敏号码），入场结果里带保单号；是否要身份证等保险公司对接方式定了再细化 | 20 | `src/pages/checkin/waiver.vue`、`packages/api`（入场返回的保险字段） | 身份证号格式校验；不保存在本地存储 |
| 22 | 入场成功页：门店、卡、扣了几次、保单状态；老带新的领取人被拦下时显示「等邀请人入场」，邀请人入场后收到提醒（订阅消息，mock 下直接刷新） | 19 | `src/pages/checkin/done.vue` | 同日再次入场显示「今天已入场，不再扣次」 |
| 23 | 我的 → 保险与告知书：历次保单、已签的告知书 | 20, 22 | `src/pages/me/insurance.vue` | 能看到每次入场对应的保险记录 |

## F. 分享

| # | 任务 | 依赖 | 涉及文件 | 完成标准 |
|---|---|---|---|---|
| 24 | 次卡转赠：选次数 → 生成分享 → `onShareAppMessage` 带 token 的路径；契约里分享改用 token（`GET /shares/:token`） | 3, 10 | `src/pages/share/count.vue`、`packages/api` | 转赠后原卡立刻少次；分享卡片标题和图片正确 |
| 25 | 老带新：本月名额、发邀请、已发记录 | 3, 9 | `src/pages/share/referral.vue` | 没期限卡或名额用完时说明原因 |
| 26 | 领取页：朋友点开 → 登录 → 领取；已领、过期、自己发的分别提示 | 7, 24 | `src/pages/share/claim.vue` | H5 下用两位示例会员能走通转赠和老带新 |
| 27 | ⏸ 转赠到期没人领：退回原卡（`@climb/core` 加规则和单测）；已发的分享可以撤回 | 24 | `packages/core/src/rules.ts`、`src/mock/routes/shares.ts`、`src/pages/me/shares.vue` | 退回在流水里记 `share_return` |

## G. 团课

| # | 任务 | 依赖 | 涉及文件 | 完成标准 |
|---|---|---|---|---|
| 28 | `@climb/core` 加团课类型和规则：人数上限、候补、取消截止（先用占位：开课前 2 小时）、扣团课次数 | — | `packages/core/src/types.ts`、`packages/core/src/classes.ts` + 单测 | 满员进候补；截止后不能取消；取消退回次数 |
| 29 | 契约 + mock：课表 `GET /classes?store=&from=`、预约、取消、我的预约 | 1, 28 | `packages/api`、`src/mock/routes/classes.ts` | 单测覆盖预约和取消 |
| 30 | 团课页面：按门店和日期看课表、预约（没课包时引导购买）、取消 | 13, 29 | `src/pages/classes/*` | 和原型一致；首页「今日团课」接上真实数据 |

## H. 私教

| # | 任务 | 依赖 | 涉及文件 | 完成标准 |
|---|---|---|---|---|
| 31 | `@climb/core` 加私教时段规则：教练每小时一格、已占用/线下约/请假不能约、取消截止（占位：提前 12 小时） | — | `packages/core/src/pt.ts` + 单测 | 时段冲突被拦下 |
| 32 | 契约 + mock：教练列表、某教练 7 天的空闲时段、预约、取消 | 1, 31 | `packages/api`、`src/mock/routes/pt.ts` | 单测覆盖冲突和取消 |
| 33 | ⏸ 私教页面：选教练 → 选时段 → 确认（扣私教课时）；约课是否要教练确认等馆方定 | 13, 32 | `src/pages/pt/*` | 和原型一致 |
| 34 | 教练端「我的排班」：员工身份登录后多出这一页，点格子占时段（线下约、有事）；会员约了收到提醒。原型里的「说一句话」不在本期 | 7, 32 | `src/pages/coach/*` | 教练占的时段会员那边马上显示不可约 |

## I. 活动报名

| # | 任务 | 依赖 | 涉及文件 | 完成标准 |
|---|---|---|---|---|
| 35 | ⏸ 契约 + mock + `@climb/core`：活动列表、详情、报名（限人数、可能收费、报名要填的信息）、取消 | 1, 14 | `packages/core`、`packages/api`、`src/mock/routes/events.ts` | 满员不能报；收费活动走订单 |
| 36 | 活动页面：列表、详情、报名表单、我的报名 | 35 | `src/pages/events/*` | 和原型一致；首页「近期活动」接上 |

## J. 我的

| # | 任务 | 依赖 | 涉及文件 | 完成标准 |
|---|---|---|---|---|
| 37 | 契约 + mock + 页面：攀爬日历 `GET /me/check-ins?month=` | 17 | `src/pages/me/calendar.vue` | 按月切换，入场的日子标出门店；被前台撤销的入场不算（卡详情流水里显示「撤销入场」，次数退回） |
| 38 | 我的页面汇总：头像、会员信息、预约（团课 + 私教）、分享记录、订单、保险与告知书入口 | 16, 23, 30, 33 | `src/pages/me/index.vue` | 各入口都能进 |

## K. 美团 / 大众点评

| # | 任务 | 依赖 | 涉及文件 | 完成标准 |
|---|---|---|---|---|
| 39 | ⏸ 美团券兑换：会员在小程序里输入或扫美团券码，兑换成对应的卡（核销在后端调美团接口）；在售套餐和核销方式等馆方回复 | 6, 10 | `packages/api`、`src/mock/routes/meituan.ts`、`src/pages/cards/redeem.vue` | mock 下有效券换成卡、已用过的券提示 |

## L. 上线前

| # | 任务 | 依赖 | 涉及文件 | 完成标准 |
|---|---|---|---|---|
| 40 | 订阅消息：入场提醒（老带新邀请人已入场）、约课提醒、卡快到期 | 22, 30, 33 | `src/lib/subscribe.ts` | 授权弹窗只在用户操作时出现 |
| 41 | 接真实后端：配置测试/正式环境的 `VITE_API_BASE`，去掉 mock 兜底（mock 只在开发时打包） | 后端就绪 | `src/api.ts`、`.env.*` | 正式包里不含 `src/mock` |
| 42 | 体验版自测清单：原型里的 11 条演示路线在体验版上逐条走一遍 | 全部 | `docs/tasks-miniapp.md` | 每条路线记录结果 |
