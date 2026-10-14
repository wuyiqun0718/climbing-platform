# climbing-platform

攀岩馆的会员小程序和门店管理后台。第一个客户是 BENCHMARK 攀岩馆（三家店：滨港店、汇聚店、环球港店），之后要服务多家岩馆。

开始工作前先读：

- `docs/project-context.md`：项目背景、已经定下的决定和原因、等客户确认的问题、当前进度、下一步
- `docs/sales-pitch.md`：去跟 BENCHMARK 老板谈的思路
- `README.md`：仓库结构、常用命令、按岩馆打包的机制、代码约定

## 约定

- 金额用「分」存整数，日期用本地日期字符串 `YYYY-MM-DD`，工具在 `@climb/utils`。
- 业务规则（能不能入场、扣几次、能不能领取）只写在 `@climb/core`，并配单测，页面里不重复判断。
- 组件里不写死颜色，用主题 CSS 变量；每个岩馆的配置和主题在 `gyms/<岩馆>/`。
- 小程序组件按 `.vue` 路径引入（`@climb/ui-mp/MemberCard.vue`），否则 uni-app 不会注册成小程序组件。
- 界面文案用简体中文，口语、直接，不用营销腔。
- `prototype/` 是给客户演示的纯 HTML 原型，不需要构建，`pnpm prototype` 启动（http://localhost:8765）。
- `AGENTS.md` 是 turbo 自动维护的说明，保持提交状态即可。
- Git 提交作者用个人账号 `wuyiqun0718 <wuyiqun0718@gmail.com>`；远程仓库是 `github.com/wuyiqun0718/climbing-platform`（私有）。
