# 和小程序分支统一 core（降低合并冲突）

日期：2026-10-22。基准：`origin/mvp/miniapp`（bce2550）。目标：两个分支都有的 `packages/core` 文件尽量逐字一致。

## 结果一览

`packages/core/src` 里小程序分支有的 43 个文件（含测试）：

- **39 个和小程序逐字一致**，合并时没有冲突：
  calendar、checkIn、checkInDone、classes、entryQr、entrySheet、freeze、insurance、insuranceHistory、ledger、orders、pt、referral、share、shareToken、shop、summary、waiver、wallet（各自的 `.ts` 和 `.test.ts`），还有 `rules.test.ts`。
  其中 calendar、checkInDone、entrySheet、insuranceHistory、orders、referral、share、shareToken、summary、waiver、wallet 是这次从小程序原样拷过来的（小程序版本的 rules.ts / types.ts / api index.ts 依赖它们）。
- **4 个是合并版**（小程序版本 + 后台加的东西，只加不改），**合并时小程序那边直接拷这边的**：

| 文件 | 在小程序版本上加了什么 |
|---|---|
| `types.ts` | `Product.sort?`（后台卡种排序）；`LedgerEntry` 加可选的 `operatorType` / `operatorId`，`refType` 多一个 `'import'`；新类型 `LedgerOperatorType` |
| `rules.ts` | `RuleErrorCode` 末尾加后台用的错误码（撤销、调整、退款、员工、排课、签到），函数一行没改 |
| `gym.ts` | `GymRules.expiryReminderDays`（看板快到期提醒天数）和默认值 7 |
| `index.ts` | 小程序的导出原样在前，后面加后台独有模块的导出 |

`packages/api`：`client.ts`、`api.test.ts` 和小程序一致；`index.ts` = 小程序版本 + 两行 `export * from './admin'; export * from './desk';`。后台接口都在 `admin.ts`、`desk.ts`（小程序没有这两个文件）。

## 这次怎么做的

1. **分享**：删掉后台的 `shareRecord.ts`，分享记录改调小程序 `share.ts` 的 `shareDisplayStatus` / `SHARE_STATUS_TEXT`。小程序的状态集合（pending / claimed / used / returned / expired）已经覆盖后台要的，**share.ts 没有加任何东西**。分享类型的文字（次卡转赠 / 老带新）只有后台用，放在 `admin.ts` 的 `SHARE_KIND_TEXT`。接口 `ShareRow.state` 改名 `status`。
2. **订单状态**：`OrderStatus` / `ORDER_STATUS_LABELS` 用小程序 `orders.ts` 的（原样拷来）。后台的 `'unpaid'` 改成 `'pending'`；`refund.ts` 引用 orders.ts。`admin.ts` 的 `ORDER_STATUS_TEXT` 删掉，页面改用 `ORDER_STATUS_LABELS`。后台订单不会关单，所以不会出现 `closed`。
3. **流水**：统一成小程序 `types.ts` 的 `LedgerEntry`（`refType` / `refId`、`on`、`remainingAfter` 可选、`note` 可选）。后台的写流水函数、mock 示例数据、测试都改成这个形状，业务日期 `on` 取记录时间的日期（`ledgerCheck.ts` 的 `ledgerOnOf`）。原因文字用小程序 `ledger.ts` 的 `LEDGER_REASON_LABELS`。
4. **后台独有的挪到新文件**，让共享文件保持一致：
   - `ledgerCheck.ts`：流水对账 `ledgerMismatch`、`ledgerDeltaText`、`ledgerAfterText`（原来在 ledger.ts）
   - `checkInLedger.ts`：前台登记入场的流水 `checkInLedgerEntry`（原来在 checkIn.ts）
   - `entryPolicy.ts`：入场记录上的保单 `entryPolicy`（原来在 insurance.ts）
   - `expiring.ts`：看板快到期 `expiringPeriodCards`（原来在 rules.ts）
   - `cardAdjust.ts` 里的 `followersAfter`：原来在 freeze.ts 里导出私有的 `chainFollowers`。现在 freeze.ts 跟小程序一致，这里照着写了一份同样的逻辑，**两边改的时候要一起改**。
   - 测试同样拆到 `ledgerCheck.test.ts`、`checkInLedger.test.ts`、`entryPolicy.test.ts`、`expiring.test.ts`。
5. **改名避免重名**：
   - `order.ts` 的 `periodStartsOn` 改名 `deskPeriodStartsOn`（跟 orders.ts 的同名函数算法不一样，见下面）；
   - `admin.ts` 的 `CheckInPreview` 改名 `DeskCheckInPreview`（小程序 api index 里有同名的会员端类型）。
6. **后台调用方适配**：
   - `checkInWith` 用小程序的签名，多一个 `via: 'scan' | 'desk'`；
   - 后台的老带新、送卡、领卡改用小程序 referral.ts / share.ts（后台本来只在测试里用）；
   - 小程序会员接口 `coaches.list` 改成小程序的 `pt.coaches`。

## 行为上跟着小程序变了的（已定规则或命名，没改业务）

- **扫码入场要先签风险告知书**：小程序 checkIn.ts 已定 `CHECK_IN_REQUIRES_WAIVER.scan = true`。后台 mock 的会员扫码接口现在会拦没签的人；前台登记仍然不拦（`desk = false`，等馆方）。
- **冻结、作废、退款的卡拿来入场**：小程序 rules.ts 对这种卡先报 `card-inactive`。后台列卡时本来就不列这些卡，前台登记接口的结果没变。
- **流水原因文字**用小程序那份：「买卡」→「购买」，「手动调整」→「前台调整」，「青橙导入」→「从原系统转入」。
- **体验券的流水剩余**按小程序 ledger.ts 的 `remainingOf` 算：没用过 1、用过 0；原来是 null。期限卡不带 remainingAfter。
- **订单状态文字**用小程序那份：「已付款」→「已支付」，「没付款」→「待支付」。

## 仍有差异、需要业务拍板的（没有自己定）

1. **期限卡从哪天开始**：
   - 小程序 `orders.ts` 的 `periodStartsOn`：冻结中的期限卡也算，按冻结顺延后的到期日（`periodEndOn`）往后接。
   - 后台 `order.ts` 的 `deskPeriodStartsOn`：只看状态正常的卡，按卡上的到期日接。
   - 会员有一张冻结中的期限卡时，两边开出来的新卡开始日不一样。
2. **没填有效月数的多次卡（次卡、课包）有效期**：
   - 小程序 `cardFromProduct` 是当天有效；
   - 后台 `issueCard` 按 `DEFAULT_VALID_MONTHS`（12 个月），只有单次票当天有效（任务 14 的补充里写的是「跟小程序对齐」，后来小程序改了）。
3. **体验券入场记不记流水**：
   - 小程序用 `ledger.ts` 的 `entryLedgerDelta`，体验券用掉记一笔 -1；
   - 后台 `checkInLedgerEntry` 只在扣了次的时候记，体验券不记。
   - 合并后扫码入场走哪一套要定。

## 合并时要做的

- `types.ts`、`rules.ts`、`gym.ts`、`index.ts`、`packages/api/src/index.ts`：用这边的版本（已经包含小程序的全部内容）。
- 小程序的 mock 要读后台 mock 同一份数据：卡种、课表、教练、入场码、入场记录、分享。后台 mock 的老带新邀请（`MockReferral`）还不是完整的 `Share`（没有 token），算状态时临时拼了一个 Share，合并时换成小程序的 shares 数据。
- 上面三条业务分歧定了以后，删掉后台那份或小程序那份。
