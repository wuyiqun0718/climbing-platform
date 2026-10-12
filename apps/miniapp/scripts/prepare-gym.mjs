// 按岩馆生成 src/manifest.json（小程序名称、AppID）并复制岩馆素材到 src/static/gym
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copyGymAssets, readGym } from '../../../scripts/gym.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));

export function prepareMiniapp() {
  const gym = readGym();
  const manifest = JSON.parse(readFileSync(path.join(APP, 'manifest.base.json'), 'utf8'));
  manifest.name = gym.name;
  manifest['mp-weixin'].appid = gym.wechatAppId;
  manifest.h5.title = gym.name;
  writeFileSync(path.join(APP, 'src/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  copyGymAssets(gym.id, path.join(APP, 'src/static/gym'));
  return gym;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gym = prepareMiniapp();
  console.log(`已切换到 ${gym.name}（${gym.id}）`);
}
