<script setup lang="ts">
import { StatTile } from '@climb/ui-web';
import { formatDot, formatYuan, toDateKey, weekdayOf } from '@climb/utils';
import gym from '@gym';

const today = toDateKey(new Date());

// 示例数字：接上后端前先占位，展示共享组件和工具函数怎么用
const stats = {
  revenueCents: 14_077_800,
  entries: 103,
  bookings: 21,
  members: 312,
};
</script>

<template>
  <header class="page-h">
    <h1>数据看板</h1>
    <p>{{ formatDot(today) }} {{ weekdayOf(today) }}，{{ gym.name }}</p>
  </header>
  <section class="grid">
    <StatTile hero label="本月营收" :value="formatYuan(stats.revenueCents)" note="示例数据，接入后端后替换" />
    <StatTile label="今日入场" :value="stats.entries" unit="人次" />
    <StatTile label="今日约课" :value="stats.bookings" unit="人次" />
    <StatTile label="有效会员" :value="stats.members" unit="人" />
  </section>
  <p class="note">完整的看板设计见仓库的 prototype/ 目录（切到「管理后台」）。</p>
</template>

<style scoped>
.page-h h1 { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.page-h p { margin: 4px 0 20px; font-size: 13px; color: var(--ink-muted); }
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.note { margin-top: 20px; font-size: 13px; color: var(--ink-muted); }
@media (max-width: 1100px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
</style>
