// 按岩馆打包用的公共函数：读取 gyms/<id>/gym.json、复制岩馆素材
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GYMS_DIR = path.join(ROOT, 'gyms');

export function listGyms() {
  return readdirSync(GYMS_DIR).filter(d => existsSync(path.join(GYMS_DIR, d, 'gym.json')));
}

/** 读取岩馆配置。不传 id 时用环境变量 GYM，默认 benchmark。 */
export function readGym(id = process.env.GYM || 'benchmark') {
  const file = path.join(GYMS_DIR, id, 'gym.json');
  if (!existsSync(file)) {
    throw new Error(`找不到岩馆「${id}」。现有的岩馆：${listGyms().join('、')}`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** 把 gyms/<id>/assets 复制到某个端的静态目录（先清空，避免混入别的岩馆的素材） */
export function copyGymAssets(id, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const src = path.join(GYMS_DIR, id, 'assets');
  if (existsSync(src)) cpSync(src, dest, { recursive: true });
}
