/* 三家门店
 * 原型里大部分模拟数据是按全馆生成的，看板按店查看时，用这里的规则把全馆数字拆到各店：
 * 拆分比例固定（同一个 key 每次拆法一样），三家店加起来等于全馆。
 * 小程序两部手机的演示操作都算在滨港店。
 */

const STORES = [
  { id: 'bingang', name: '滨港店', share: 0.44 },
  { id: 'huiju', name: '汇聚店', share: 0.32 },
  { id: 'huanqiugang', name: '环球港店', share: 0.24 },
];
const DEMO_STORE = 'bingang';
const storeName = id => STORES.find(s => s.id === id)?.name ?? id;

// 各店收入结构不同：滨港店期限卡多，汇聚店课程多，环球港店（商场店）次卡和单次票多
const STORE_MIX = {
  bingang: { period: 1.18, count: 0.9, pt: 1.05, class: 0.92, event: 1.1 },
  huiju: { period: 1.0, count: 0.92, pt: 1.22, class: 1.28, event: 0.9 },
  huanqiugang: { period: 0.72, count: 1.32, pt: 0.7, class: 0.8, event: 1.0 },
};

/** 由字符串得到 0–1 之间的固定随机数 */
function hash01(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  return (h % 10000) / 10000;
}

/** 把一个全馆数字拆到三家店，返回 { 店id: 数值 }，三家加起来等于 total */
function splitStores(total, key, cat) {
  const w = STORES.map(s => s.share * (cat ? STORE_MIX[s.id][cat] : 1) * (0.88 + hash01(`${key}|${s.id}`) * 0.24));
  const sum = w.reduce((a, b) => a + b, 0);
  const exact = w.map(x => Math.round(total) * x / sum), parts = exact.map(Math.floor);
  const rest = Math.round(total) - parts.reduce((a, b) => a + b, 0);
  // 四舍五入差出来的几个，给小数部分最大的店
  exact.map((v, i) => [v - parts[i], i]).sort((a, b) => b[0] - a[0]).slice(0, rest).forEach(([, i]) => (parts[i] += 1));
  return Object.fromEntries(STORES.map((s, i) => [s.id, parts[i]]));
}
/** store 为 'all' 时返回全馆数字，否则返回这家店拆到的部分 */
const storePart = (total, store, key, cat) => (store === 'all' ? total : splitStores(total, key, cat)[store]);
/** 按名字给人或记录固定分配一家常去的店 */
function storeOf(name) {
  const x = hash01(`store|${name}`);
  let acc = 0;
  for (const s of STORES) { acc += s.share; if (x < acc) return s.id; }
  return STORES[STORES.length - 1].id;
}
