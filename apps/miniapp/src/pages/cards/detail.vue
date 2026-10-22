<script setup lang="ts">
import type { CardLedgerItem, FreezeOptions } from '@climb/api';
import { freezeUntilOn, isCardLive, LEDGER_REASON_LABELS } from '@climb/core';
import MemberCard from '@climb/ui-mp/MemberCard.vue';
import Button from '@climb/ui-mp/Button.vue';
import Empty from '@climb/ui-mp/Empty.vue';
import Stepper from '@climb/ui-mp/Stepper.vue';
import { formatDot, formatMonthDay, toDateKey } from '@climb/utils';
import { onLoad } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, run } from '../../api';
import LoadFailed from '../../components/LoadFailed.vue';
import AskSheet from '../../components/AskSheet.vue';
import { ask } from '../../lib/ask';
import { cardView } from '../../lib/card-view';
import { codeMessage, NETWORK_ERROR } from '../../lib/errors';
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';

const cardId = ref('');
onLoad(q => { cardId.value = (q?.id as string | undefined) ?? ''; });

const ledger = ref<CardLedgerItem[]>([]);
const ledgerLoaded = ref(false);
const today = ref(toDateKey(new Date()));

// 每次显示都重新拉：从入场、转赠回来时记录要是新的
useRequireLogin(async () => {
  today.value = toDateKey(new Date());
  if (!cardId.value) return;
  await member.ensureLoaded().catch(() => {});
  await loadLedger();
  await loadFreeze();
});

const ledgerError = ref(false);
async function loadLedger() {
  ledgerError.value = false;
  try {
    ledger.value = await run(() => api.me.cardLedger(cardId.value), { loading: ledgerLoaded.value ? false : '加载中', silent: true });
  } catch {
    ledgerError.value = true;
  } finally {
    ledgerLoaded.value = true;
  }
}

// 期限卡自助冻结：能不能冻、能冻几天由后端按 @climb/core 的规则算，这里只负责显示
const freeze = ref<FreezeOptions | null>(null);
const pickedDays = ref(7);
/** 常用天数，一点就选上；超出能冻范围的不列 */
const quickDays = computed(() => {
  const f = freeze.value;
  return f ? [7, 14, 30].filter(d => d >= f.minDays && d <= f.maxDays) : [];
});
const untilText = computed(() => formatMonthDay(freezeUntilOn(today.value, pickedDays.value)));
const quotaText = computed(() => {
  const f = freeze.value;
  if (!f) return '';
  const parts = [f.monthLeft !== null && `本月还能冻 ${f.monthLeft} 次`, f.yearLeft !== null && `今年还能冻 ${f.yearLeft} 次`].filter(Boolean);
  return parts.join('，');
});

async function loadFreeze() {
  const c = card.value;
  freeze.value = null;
  if (c?.kind !== 'period' || c.status === 'frozen') return;
  freeze.value = await api.me.freezeOptions(c.id).catch(() => null);
  const f = freeze.value;
  if (f) pickedDays.value = Math.min(f.maxDays, Math.max(f.minDays, 7));
}

const confirm = (title: string, content: string) => ask({ title, content });

async function doFreeze() {
  const days = pickedDays.value;
  if (!days || !(await confirm(`冻结 ${days} 天？`, '从今天开始冻结，冻结期间不能入场、不能发老带新。可以提前解冻，到期日按实际冻结的天数顺延。'))) return;
  try {
    await member.changeCards(() => run(() => api.me.freezeCard(cardId.value, { days }), { loading: '冻结中' }));
    uni.showToast({ title: '已冻结', icon: 'none' });
  } catch {
    return;
  }
  await Promise.all([loadLedger(), loadFreeze()]);
}

async function doUnfreeze() {
  if (!(await confirm('提前解冻？', '解冻后今天就能入场，到期日按实际冻结的天数顺延。'))) return;
  try {
    await member.changeCards(() => run(() => api.me.unfreezeCard(cardId.value), { loading: '解冻中' }));
    uni.showToast({ title: '已解冻', icon: 'none' });
  } catch {
    return;
  }
  await Promise.all([loadLedger(), loadFreeze()]);
}

const card = computed(() => member.state.cards.find(c => c.id === cardId.value));
const view = computed(() => card.value && cardView(card.value, today.value, !isCardLive(card.value, today.value)));

/** 这几种流水的备注会员看得懂（冻结到哪天、顺延几天），显示出来 */
const NOTE_REASONS: CardLedgerItem['reason'][] = ['freeze', 'unfreeze', 'adjust'];

const rows = computed(() => ledger.value.map(l => ({
  id: l.id,
  date: l.on === today.value ? '今天' : formatMonthDay(l.on),
  text: [LEDGER_REASON_LABELS[l.reason], l.storeName ?? (NOTE_REASONS.includes(l.reason) ? l.note : '')].filter(Boolean).join(' · '),
  delta: l.delta ? `${l.delta > 0 ? '+' : ''}${l.delta} 次` : '',
  neg: l.delta < 0,
})));
const goCards = () => uni.switchTab({ url: '/pages/cards/index' });
const retry = async () => {
  await member.load().catch(() => {});
  if (member.state.loaded) await Promise.all([loadLedger(), loadFreeze()]);
};
</script>

<template>
  <view class="page">
    <LoadFailed v-if="!member.state.loaded && member.state.failed" :text="NETWORK_ERROR" @retry="retry" />
    <Empty v-else-if="member.state.loaded && !card" title="没找到这张卡" text="可能已经用完或转走了，回卡包看看。">
      <Button mini @tap="goCards">回卡包</Button>
    </Empty>
    <template v-else-if="view">
      <MemberCard :kind="view.kind" :name="view.name" :value="view.value" :unit="view.unit" :meta="view.meta" :tone="view.tone" :progress="view.progress" />

      <view v-if="card?.kind === 'period' && card.status === 'frozen'" class="freeze">
        <text class="freeze-t">冻结到 {{ formatDot(card.frozenUntil!) }}（含），到那天以后自动解冻</text>
        <Button variant="dark" block @click="doUnfreeze">提前解冻</Button>
      </view>
      <view v-else-if="freeze" class="freeze">
        <template v-if="!freeze.blockedBy">
          <view class="pick">
            <view class="pick-l">
              <text class="freeze-h">冻结天数</text>
              <text class="pick-s">一次 {{ freeze.minDays }}–{{ freeze.maxDays }} 天</text>
            </view>
            <Stepper v-model="pickedDays" :min="freeze.minDays" :max="freeze.maxDays" unit="天" />
          </view>
          <view v-if="quickDays.length" class="chips">
            <view v-for="d in quickDays" :key="d" class="chip" :class="{ on: d === pickedDays }" role="button" @tap="pickedDays = d">{{ d }} 天</view>
          </view>
          <text class="pick-s">从今天冻到 {{ untilText }}（含）{{ quotaText ? `，${quotaText}` : '' }}</text>
          <Button variant="dark" block @click="doFreeze">冻结 {{ pickedDays }} 天</Button>
        </template>
        <text v-else-if="freeze.blockedBy !== 'freeze-card-not-active'" class="freeze-t">暂时不能冻结：{{ codeMessage(freeze.blockedBy) }}</text>
      </view>

      <view class="sec-h"><text class="h">使用记录</text></view>
      <view class="log">
        <view v-for="r in rows" :key="r.id" class="row">
          <text class="date">{{ r.date }}</text>
          <text class="text">{{ r.text }}</text>
          <text class="delta" :class="{ neg: r.neg }">{{ r.delta }}</text>
        </view>
        <view v-if="ledgerError && !rows.length" class="row"><text class="date wide">记录没加载出来</text><text class="link" @tap="loadLedger">重试</text></view>
        <view v-else-if="ledgerLoaded && !rows.length" class="row"><text class="date wide">还没有记录</text></view>
      </view>
      <text class="fine">同一天多次进出只扣 1 次。送给朋友的次数会从这张卡里扣除，朋友领取后可以在有效期内使用。</text>
    </template>
    <AskSheet />
  </view>
</template>

<style scoped>
.page { padding: 12px 16px 32px; }
.sec-h { margin: 22px 0 8px; }
.h { font-family: var(--font-display); font-size: 20px; }
.log { border-top: var(--stroke) solid var(--ink); }
.row { display: flex; align-items: baseline; gap: 12px; padding: 12px 0; border-bottom: 1px dashed var(--ink-muted); font-size: 14px; }
.date { width: 64px; flex-shrink: 0; font-size: 12px; color: var(--ink-muted); }
.text { flex: 1; font-weight: 600; }
.delta { font-family: var(--font-number); font-weight: 700; color: var(--ink); }
.delta.neg { color: var(--ink-muted); }
.fine { display: block; margin-top: 14px; font-size: 12px; line-height: 1.6; color: var(--ink-muted); }
.freeze { margin-top: 16px; padding: 14px 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); display: flex; flex-direction: column; gap: 12px; }
.freeze-t { font-size: 14px; }
.freeze-h { font-size: 15px; font-weight: 700; }
.pick { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pick-l { display: flex; flex-direction: column; gap: 2px; }
.pick-s { font-size: 12px; line-height: 1.5; color: var(--ink-muted); }
.chips { display: flex; gap: 8px; }
.chip { flex: 1; padding: 8px 0; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); text-align: center; font-size: 14px; font-weight: 600; }
.chip.on { background: var(--brand); color: var(--on-brand); }
.date.wide { width: auto; flex: 1; }
.link { font-size: 13px; font-weight: 600; text-decoration: underline; }
</style>
