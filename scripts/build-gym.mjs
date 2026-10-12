// 给一个岩馆单独打包小程序和后台：pnpm build:gym benchmark
import { spawnSync } from 'node:child_process';
import { listGyms, readGym } from './gym.mjs';

const id = process.argv[2] || process.env.GYM;
if (!id) {
  console.error(`用法：pnpm build:gym <岩馆>\n现有的岩馆：${listGyms().join('、')}`);
  process.exit(1);
}
const gym = readGym(id);
console.log(`\n▸ 打包 ${gym.name}（${gym.id}）\n`);

const res = spawnSync('pnpm', ['exec', 'turbo', 'run', 'build', '--filter=@climb/miniapp', '--filter=@climb/dashboard'], {
  stdio: 'inherit',
  env: { ...process.env, GYM: gym.id },
  shell: process.platform === 'win32',
});
if (res.status !== 0) process.exit(res.status ?? 1);

console.log(`
✓ 打包完成
  小程序（用微信开发者工具上传）：apps/miniapp/dist/build/${gym.id}/mp-weixin
  管理后台（静态文件，部署到任意静态服务器）：apps/dashboard/dist/${gym.id}
`);
