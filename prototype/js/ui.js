/* 图标与图表 */

const ICONS = {
  home: '<path d="M3.5 11 12 4l8.5 7v8.5a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  wallet: '<rect x="3" y="6.5" width="18" height="13.5" rx="2.5"/><path d="M6 6.5 15.5 3l1.2 3.5M16 13.3h2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c0-4 3.6-6.2 8-6.2s8 2.2 8 6.2"/>',
  scan: '<path d="M4 8.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3M4 12h16"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  share: '<path d="M4.5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-6M12 3.5v12M7.5 8 12 3.5 16.5 8"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4.5" rx="1"/><path d="M5.5 12.5V20h13v-7.5M12 8v12M12 8c-1.5-3.5-6-4-6-1.5S10 8 12 8c2 0 6 .3 6-1.5S13.5 4.5 12 8"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c0-3.6 2.9-5.6 6.5-5.6s6.5 2 6.5 5.6M15.5 5a3.5 3.5 0 0 1 0 7M18 14.6c2 .6 3.5 2.4 3.5 5.4"/>',
  pin: '<path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  ticket: '<path d="M3.5 7h17v3.2a1.8 1.8 0 0 0 0 3.6V17h-17v-3.2a1.8 1.8 0 0 0 0-3.6z"/><path d="M14.5 7v10" stroke-dasharray="2 2"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-7M3 20h18"/>',
  yuan: '<path d="m7 4 5 7 5-7M6.5 11.5h11M6.5 15.5h11M12 11v9"/>',
  flag: '<path d="M5.5 21V4M5.5 4.5h11l-2.2 4 2.2 4h-11"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0z"/><circle cx="8" cy="8" r="1.5"/>',
  door: '<path d="M13.5 3.5h5a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-5M9.5 16.5 14 12 9.5 7.5M14 12H3.5"/>',
  dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 21h4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.01"/>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chat: '<path d="M4 5.5h16v11H9l-5 4z"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 5 5.1 1.5 1.5 0 0 1 6.5 3.5z"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
  hold: '<path d="M6 8.5C7 4.5 13 3 16.5 5.5s4 8.5 1 11.5-9 3.5-11.5.5S5.2 11.6 6 8.5z"/><circle cx="12" cy="11.5" r="1.6"/>',
  refresh: '<path d="M20 11.5A8 8 0 0 0 5.6 7M4 12.5A8 8 0 0 0 18.4 17M5 3.5V7.5h4M19 20.5v-4h-4"/>',
};
function icon(name, size = 20, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
// 岩点形状的头像，每个人一个固定形状
const HOLD_SHAPES = ['58% 42% 55% 45% / 48% 58% 42% 52%', '45% 55% 40% 60% / 60% 45% 55% 40%', '62% 38% 50% 50% / 40% 55% 45% 60%', '50% 50% 62% 38% / 55% 40% 60% 45%'];
function holdAvatar(text, tone = 'olive', size = 40, shape = 0) {
  const fs = String(text).length > 2 ? size * 0.27 : String(text).length === 2 ? size * 0.32 : size * 0.4;
  return `<span class="hold tone-${tone}" style="--s:${size}px;font-size:${fs.toFixed(1)}px;border-radius:${HOLD_SHAPES[shape % HOLD_SHAPES.length]}">${esc(text)}</span>`;
}

// ---------- 图表 ----------
const Charts = (() => {
  const tipEl = () => document.getElementById('tooltip');
  function showTip(html, ev) {
    const t = tipEl(); t.innerHTML = html; t.hidden = false;
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    t.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
  function hideTip() { tipEl().hidden = true; }
  function niceStep(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function topRounded(x, y, w, h, r) {
    r = Math.min(r, h, w / 2);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  // 柱状图（可堆叠）。series: [{key,name,color,values}]
  function columns(el, { labels, series, height = 220, fmt = wan, tipFmt = yuan, labelEvery = 1, highlight = -1, future = -1, tipTitle = l => l }) {
    const W = Math.max(280, el.clientWidth), H = height;
    const m = { l: 44, r: 6, t: 10, b: 26 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b, n = labels.length;
    const totals = labels.map((_, i) => series.reduce((s, se) => s + (se.values[i] || 0), 0));
    const step = niceStep(Math.max(1, ...totals) / 4), max = step * 4;
    const band = pw / n, bw = Math.min(24, band * 0.64);
    const y = v => m.t + ph - (v / max) * ph;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = max * i / 4, yy = y(v);
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" class="grid"/><text x="${m.l - 8}" y="${yy + 4}" class="ax" text-anchor="end">${fmt(v)}</text>`;
    }
    let bars = '', hits = '';
    labels.forEach((lab, i) => {
      const cx = m.l + band * i + band / 2, x = cx - bw / 2;
      let acc = 0;
      const segs = series.map(se => ({ se, v: se.values[i] || 0 })).filter(s => s.v > 0);
      if (i > future && future >= 0) {
        bars += `<rect x="${x}" y="${m.t + ph - 2}" width="${bw}" height="2" rx="1" class="empty"/>`;
      }
      segs.forEach((s, j) => {
        const y0 = y(acc), y1 = y(acc + s.v); acc += s.v;
        const top = j === segs.length - 1;
        const gap = j > 0 ? 2 : 0;
        const hh = Math.max(0, y0 - y1 - gap);
        const op = highlight >= 0 && i !== highlight ? ' style="opacity:.42"' : '';
        bars += top ? `<path d="${topRounded(x, y1, bw, hh, 4)}" fill="${s.se.color}"${op}/>` : `<rect x="${x}" y="${y1}" width="${bw}" height="${hh}" fill="${s.se.color}"${op}/>`;
      });
      if (i % labelEvery === 0 || i === n - 1) bars += `<text x="${cx}" y="${H - 8}" class="ax" text-anchor="middle">${esc(lab)}</text>`;
      hits += `<rect x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ph}" class="hit" data-i="${i}"/>`;
    });
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart" role="img">${g}<g class="hover-band"></g>${bars}${hits}</svg>`;
    const svg = el.querySelector('svg'), hb = svg.querySelector('.hover-band');
    svg.addEventListener('mousemove', ev => {
      const r = ev.target.closest('.hit'); if (!r) return;
      const i = +r.dataset.i;
      hb.innerHTML = `<rect x="${m.l + band * i + 2}" y="${m.t}" width="${band - 4}" height="${ph}" rx="6" class="band"/>`;
      if (i > future && future >= 0) { showTip(`<b>${esc(tipTitle(labels[i]))}</b><div class="tip-row muted">还没到这个时段</div>`, ev); return; }
      const rows = series.length > 1
        ? series.map(se => `<div class="tip-row"><i style="background:${se.color}"></i><span>${esc(se.name)}</span><b>${tipFmt(se.values[i] || 0)}</b></div>`).reverse().join('') + `<div class="tip-row total"><span>合计</span><b>${tipFmt(totals[i])}</b></div>`
        : `<div class="tip-row"><span>${esc(series[0].name)}</span><b>${tipFmt(totals[i])}</b></div>`;
      showTip(`<b>${esc(tipTitle(labels[i]))}</b>${rows}`, ev);
    });
    svg.addEventListener('mouseleave', () => { hb.innerHTML = ''; hideTip(); });
  }

  // 迷你折线
  function spark(values, { w = 96, h = 28, color = 'var(--olive-700)' } = {}) {
    const max = Math.max(...values), min = Math.min(...values);
    const pts = values.map((v, i) => [i / (values.length - 1) * (w - 6) + 3, h - 4 - ((v - min) / (max - min || 1)) * (h - 8)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    const [lx, ly] = pts[pts.length - 1];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="spark" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--ink-4)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lx}" cy="${ly}" r="3.5" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  }

  return { columns, spark, showTip, hideTip };
})();
