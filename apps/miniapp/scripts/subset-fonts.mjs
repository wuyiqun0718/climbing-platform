// 给小程序生成字体子集（woff2）。小程序不能用本地 @font-face，要用 uni.loadFontFace 从 https 地址下载，
// 完整的 ZCOOL 有 8MB，所以只留页面用到的字。H5 不用这个，直接用 @fontsource 的按需分片。
//
// 需要 fonttools（pip install fonttools brotli），命令行里能找到 pyftsubset 和 fonttools，
// 或者用 FONTTOOLS_BIN 指向它们所在的目录。
// 用法：node apps/miniapp/scripts/subset-fonts.mjs
// 产物：apps/miniapp/fonts/*.woff2，上传到 COS 后把地址填进 src/config/fonts.ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('..', import.meta.url));
const ROOT = path.resolve(APP, '../..');
const CACHE = path.join(APP, 'node_modules/.cache/font-sources');
const OUT = path.join(APP, 'fonts');

// 完整字体来自 Google Fonts 的仓库（SIL OFL 1.1），只下载一次
const SOURCES = {
  zcool: 'https://github.com/google/fonts/raw/main/ofl/zcoolqingkehuangyou/ZCOOLQingKeHuangYou-Regular.ttf',
  bricolage: 'https://github.com/google/fonts/raw/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf',
};

const bin = name => (process.env.FONTTOOLS_BIN ? path.join(process.env.FONTTOOLS_BIN, name) : name);
const run = (name, args) => execFileSync(bin(name), args, { stdio: ['ignore', 'ignore', 'inherit'] });

async function source(key) {
  const file = path.join(CACHE, `${key}.ttf`);
  if (!fs.existsSync(file)) {
    console.log(`▸ 下载 ${key}`);
    const res = await fetch(SOURCES[key]);
    if (!res.ok) throw new Error(`下载失败：${SOURCES[key]}（${res.status}）`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

/** 递归读出目录里源码文件的内容 */
function readSources(dir) {
  if (!fs.existsSync(dir)) return '';
  return fs.readdirSync(dir, { withFileTypes: true }).map(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'static' ? '' : readSources(p);
    return /\.(vue|ts|json)$/.test(e.name) && !e.name.endsWith('.test.ts') ? fs.readFileSync(p, 'utf8') : '';
  }).join('\n');
}

function displayText() {
  const curated = fs.readFileSync(path.join(APP, 'scripts/fonts/display-text.txt'), 'utf8')
    .split('\n').filter(l => !l.startsWith('#')).join('');
  const code = [path.join(APP, 'src'), path.join(ROOT, 'packages/ui-mp/src'), path.join(ROOT, 'gyms')].map(readSources).join('');
  // 中文、中文标点、全角符号；ASCII 用 unicodes 整段加
  const cjk = (curated + code).match(/[　-〿一-鿿＀-￯]/g) ?? [];
  return [...new Set(cjk)].sort().join('');
}

const kb = f => `${(fs.statSync(f).size / 1024).toFixed(1)} KB`;
fs.mkdirSync(OUT, { recursive: true });
const common = ['--flavor=woff2', '--no-hinting', '--desubroutinize', '--layout-features=*', '--name-IDs=*'];

// 标题：ZCOOL，页面用到的字 + ASCII
const text = displayText();
const textFile = path.join(CACHE, 'display-text.txt');
fs.writeFileSync(textFile, text);
const zcool = path.join(OUT, 'zcool-qingke-huangyou.woff2');
run('pyftsubset', [await source('zcool'), `--text-file=${textFile}`, '--unicodes=U+0020-007E', `--output-file=${zcool}`, ...common]);
console.log(`✓ ${path.relative(ROOT, zcool)}：${text.length} 个中文字符，${kb(zcool)}`);

// 数字：Bricolage，拉丁子集。固定宽度和光学尺寸，只保留原型用到的 500–800 字重（仍是可变字体）
const pinned = path.join(CACHE, 'bricolage-pinned.ttf');
run('fonttools', ['varLib.instancer', await source('bricolage'), 'wdth=100', 'opsz=32', 'wght=500:800', '-q', '-o', pinned]);
const bricolage = path.join(OUT, 'bricolage-grotesque.woff2');
run('pyftsubset', [pinned, '--unicodes=U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2026,U+2212', `--output-file=${bricolage}`, ...common]);
console.log(`✓ ${path.relative(ROOT, bricolage)}：拉丁字符，${kb(bricolage)}`);
