# climbing-platform

攀岩馆的会员小程序和门店管理后台。一个仓库服务多家岩馆：业务规则、组件、工具和接口层共用，每家岩馆有自己的配置（名称、小程序 AppID、配色、规则），可以单独打包。

## 目录

```
climbing-platform/
├─ apps/
│  ├─ miniapp/        会员端微信小程序（uni-app + Vue 3），一套代码按岩馆打包
│  └─ dashboard/      门店管理后台（Vue 3 + Vite），一套代码按岩馆打包
├─ packages/
│  ├─ core/           业务规则：卡种、入场扣次、次卡转赠、老带新（纯 TypeScript，有单测）
│  ├─ api/            接口定义和请求封装；小程序用 uni.request，后台用 fetch
│  ├─ theme/          设计变量，转成 CSS 变量给两个端用
│  ├─ utils/          日期、金额等工具
│  ├─ ui-mp/          小程序组件（view/text 等小程序标签）
│  └─ ui-web/         后台组件（网页）
├─ gyms/
│  └─ benchmark/      BENCHMARK 攀岩馆：gym.json（名称、AppID、标志）+ 主题和规则 + 素材
├─ prototype/         最早的可点击原型（纯 HTML，双击 index.html 就能打开）
└─ scripts/           按岩馆打包、启动原型等脚本
```

项目背景、已经定下的决定、等客户确认的问题和下一步，见 `docs/project-context.md`；跟客户谈的思路见 `docs/sales-pitch.md`；MVP 执行计划和数据模型见 `docs/mvp-plan.md`。

共享包不需要单独构建：`exports` 直接指向 `src` 里的 TypeScript 和 `.vue` 源码，由各个 app 的 Vite 编译。

## 常用命令

需要 Node 20+ 和 pnpm 9。

```bash
pnpm install

pnpm dev:dashboard        # 后台，http://localhost:5174
pnpm dev:mp               # 小程序，产物在 apps/miniapp/dist/dev/benchmark/mp-weixin，用微信开发者工具导入
pnpm dev:h5               # 小程序的 H5 版本，在浏览器里调页面，http://localhost:5173
pnpm prototype            # 原型，http://localhost:8765

pnpm test                 # 单测（vitest）
pnpm typecheck            # 全仓类型检查

pnpm build:gym benchmark  # 给一个岩馆打包小程序和后台
```

切换岩馆：所有 dev / build 命令都读环境变量 `GYM`，默认 `benchmark`，比如 `GYM=另一个馆 pnpm dev:dashboard`。

`pnpm build:gym <岩馆>` 的产物：

- 小程序：`apps/miniapp/dist/build/<岩馆>/mp-weixin`，用微信开发者工具上传
- 后台：`apps/dashboard/dist/<岩馆>`，静态文件，放到任意静态服务器

## 按岩馆打包是怎么做的

1. `gyms/<岩馆>/gym.json` 放打包时要用的信息：名称、小程序 AppID、标志文件名。
2. `gyms/<岩馆>/src/index.ts` 用 `defineGym()` 补上主题、营业时间、业务规则和功能开关。
3. 两个 app 的 `vite.config.ts` 把 `@gym` 指向 `gyms/$GYM/src/index.ts`，代码里 `import gym from '@gym'` 就是当前岩馆的配置，别的岩馆不会被打进包里。
4. 打包前 `prepare-gym` 脚本会生成小程序的 `src/manifest.json`（名称、AppID），并把 `gyms/<岩馆>/assets` 复制到两个端的静态目录。这些生成的文件不提交。

## 新增一个岩馆

1. 复制 `gyms/benchmark` 为 `gyms/<新岩馆>`，把 `package.json` 里的包名改成 `@climb/gym-<新岩馆>`。
2. 改 `gym.json`：名称、小程序 AppID、标志文件名；替换 `assets` 里的标志。
3. 改 `src/index.ts` 里的主题颜色和规则（比如每月老带新次数）。
4. 在 `apps/miniapp` 和 `apps/dashboard` 的 `devDependencies` 里加上 `"@climb/gym-<新岩馆>": "workspace:*"`，然后 `pnpm install`。
5. `pnpm build:gym <新岩馆>`。

如果某个岩馆需要大改页面，再单独建 `apps/<岩馆>-miniapp`，照样复用 `packages/` 里的东西。

## 约定

- 金额一律用「分」存整数（`Cents`），只在展示时用 `formatYuan()` 转换。
- 日期用本地日期字符串 `YYYY-MM-DD`（`DateKey`），工具函数在 `@climb/utils`。
- 业务规则（能不能入场、扣几次、能不能领取）只写在 `@climb/core`，页面里不重复判断；以后后端用 Node 写的话也可以直接复用。
- 组件里不写死颜色，用主题 CSS 变量：`var(--brand)`、`var(--accent)`、`var(--ink)` 等，完整列表见 `packages/theme`。
- 小程序组件要按 `.vue` 路径引入：`import MemberCard from '@climb/ui-mp/MemberCard.vue'`。从 `index.ts` 转出的话，uni-app 不会把它注册成小程序组件，页面上会显示不出来。

## 现状

- 原型里的规则已经搬进 `@climb/core`，有单测：入场扣次、同日再次入场不扣、次卡转赠和领取、老带新每月名额和「邀请人当天先入场」。
- 小程序和后台各有一个能构建、能预览的首页，用的是示例数据。
- 后端还没开始；`@climb/api` 里的接口路径是约定稿，后端可以放在 `services/` 下。
- `gyms/benchmark/gym.json` 里的 AppID 是微信开发者工具的测试号 `touristappid`，正式发布前换成馆方的 AppID。
