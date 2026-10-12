// 包一层 uni 命令：先按 GYM 准备配置，再把产物输出到 dist/<dev|build>/<岩馆>/<平台>
// 用法：node scripts/uni.mjs <dev|build> <mp-weixin|h5>
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareMiniapp } from './prepare-gym.mjs';

const [mode, platform] = process.argv.slice(2);
if (!['dev', 'build'].includes(mode) || !platform) {
  console.error('用法：node scripts/uni.mjs <dev|build> <mp-weixin|h5>');
  process.exit(1);
}

const gym = prepareMiniapp();
const APP = fileURLToPath(new URL('..', import.meta.url));
const outDir = path.join(APP, 'dist', mode, gym.id, platform);
console.log(`▸ ${gym.name}：${mode} ${platform} → ${path.relative(APP, outDir)}`);

const args = mode === 'build' ? ['build', '-p', platform] : ['-p', platform];
const child = spawn('uni', args, {
  cwd: APP,
  stdio: 'inherit',
  env: { ...process.env, GYM: gym.id, UNI_OUTPUT_DIR: outDir },
  shell: process.platform === 'win32',
});
child.on('exit', code => process.exit(code ?? 1));
