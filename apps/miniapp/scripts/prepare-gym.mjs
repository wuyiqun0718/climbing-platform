// 按岩馆生成小程序的配置文件，并复制岩馆素材到 src/static/gym：
// - src/manifest.json：小程序名称、AppID
// - src/pages.json：由 pages.base.json 生成，导航栏和 tabBar 的颜色取自岩馆主题
// - src/styles/theme.css：主题 CSS 变量，挂在 page 上，所有页面都能用
// - src/static/gym/tab-*.png：底部 tab 图标，按主题色画
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { copyGymAssets, readGym, ROOT } from '../../../scripts/gym.mjs';
import { writeTabIcons } from './tab-icons.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));

/** 岩馆配置是 TypeScript（gyms/<id>/src/index.ts），借 Vite 加载，和打包时拿到的是同一份 */
async function loadGymModule(id) {
  const server = await createServer({
    configFile: false,
    root: APP,
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const gym = await server.ssrLoadModule(path.join(ROOT, 'gyms', id, 'src/index.ts'));
    const { toCssVars } = await server.ssrLoadModule('@climb/theme');
    return { gym: gym.default, toCssVars };
  } finally {
    await server.close();
  }
}

/** 小程序的 navigationBarTextStyle 等只能填 black / white：取跟这个颜色更接近的那个 */
export function nearestBlackOrWhite(hex) {
  const n = parseInt(hex.replace('#', '').replace(/^(.)(.)(.)$/, '$1$1$2$2$3$3'), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? 'white' : 'black';
}

const BLACK_OR_WHITE = new Set(['navigationBarTextStyle', 'borderStyle']);

/** 把 pages.base.json 里的 "$brand" 这类值换成主题颜色；只能填 black / white 的字段取跟这个颜色更接近的那个 */
export function fillTheme(node, theme, key = '') {
  if (Array.isArray(node)) return node.map(v => fillTheme(v, theme));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fillTheme(v, theme, k)]));
  }
  if (typeof node !== 'string' || !node.startsWith('$')) return node;
  const color = theme[node.slice(1)];
  if (typeof color !== 'string') throw new Error(`pages.base.json：主题里没有「${node.slice(1)}」`);
  return BLACK_OR_WHITE.has(key) ? nearestBlackOrWhite(color) : color;
}

export async function prepareMiniapp() {
  const meta = readGym();
  const manifest = JSON.parse(readFileSync(path.join(APP, 'manifest.base.json'), 'utf8'));
  manifest.name = meta.name;
  manifest['mp-weixin'].appid = meta.wechatAppId;
  manifest.h5.title = meta.name;
  writeFileSync(path.join(APP, 'src/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const { gym, toCssVars } = await loadGymModule(meta.id);
  const pages = JSON.parse(readFileSync(path.join(APP, 'pages.base.json'), 'utf8'));
  writeFileSync(path.join(APP, 'src/pages.json'), JSON.stringify(fillTheme(pages, gym.theme), null, 2) + '\n');

  const vars = Object.entries(toCssVars(gym.theme)).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  mkdirSync(path.join(APP, 'src/styles'), { recursive: true });
  writeFileSync(path.join(APP, 'src/styles/theme.css'), `/* 由 scripts/prepare-gym.mjs 按岩馆「${meta.id}」生成，不要手改 */\npage {\n${vars}\n}\n`);

  copyGymAssets(meta.id, path.join(APP, 'src/static/gym'));
  writeTabIcons(gym.theme, path.join(APP, 'src/static/gym'));
  return meta;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gym = await prepareMiniapp();
  console.log(`已切换到 ${gym.name}（${gym.id}）`);
}
