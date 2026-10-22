# 小程序原生选择器检查（只记录，不改）

2026-10-23，看的是 `origin/mvp/miniapp`（c9f771b）。这个 worktree 里的 `apps/miniapp` 还是旧代码，没有选择器。
后台的原生 `<select>` 已经换成 `UiSelect`（截图见 `before/select/`、`after/select/`）；小程序只记下面这些，留给小程序分支处理。

全仓库搜 `<picker`、`showActionSheet`，一共 3 处：

| 位置 | 用法 | 问题 | 严重程度 |
| --- | --- | --- | --- |
| `pages/cards/detail.vue:119` 冻结天数 | `<picker mode="selector">` 包一行字「冻结 7 天（1–30 天），点这里改」 | 能点的地方只是一行普通文字，没有边框、箭头，也不像能点。H5 截图里这行和下面「本月还能冻 1 次」之间空了一大块，像是 picker 外层多出来的高度。弹出来的滚轮是微信原生的，样式改不了，这点没问题 | 明显，建议改 |
| `pages/coach/schedule.vue:49` 教练改时段状态 | `uni.showActionSheet` | 系统灰白底的菜单，跟 UI 走查后新加的 `ui-mp` Sheet（黑框底部弹层）不是一套。功能没问题 | 一般 |
| `pages/checkin/start-scan.ts:18` H5 模拟扫码 | `uni.showActionSheet` | 只在 H5 mock 下出现，真机不会用到 | 不用管 |

## 建议（没改）

- 冻结天数：做成一个跟输入框一样的行（2px 黑框、右边留 12px 以上放下箭头），文字写「冻结天数　7 天」，把「点这里改」去掉。顺便查一下多出来的那块空白是不是 picker 外层的 `view` 高度造成的。
- 教练时段：换成 `ui-mp` 的 Sheet，跟会员端弹层一致。
- 原生滚轮（`picker` 弹出部分）保留，小程序里自己画滚轮不值得。

参考截图：`origin/mvp/miniapp` 的 `docs/ui-review/after/card-detail-year.png`。
