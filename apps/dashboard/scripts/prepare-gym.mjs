// 把当前岩馆（GYM）的素材复制到 public/gym，页面里用 /gym/<文件名> 引用
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyGymAssets, readGym } from '../../../scripts/gym.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const gym = readGym();
copyGymAssets(gym.id, path.join(APP, 'public/gym'));
console.log(`已切换到 ${gym.name}（${gym.id}）`);
