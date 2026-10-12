// 本地打开原型：pnpm prototype（也可以直接双击 prototype/index.html）
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { ROOT } from './gym.mjs';

const dir = path.join(ROOT, 'prototype');
const port = Number(process.env.PORT) || 8765;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.normalize(path.join(dir, url));
  if (file !== dir && !file.startsWith(dir + path.sep)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!existsSync(file)) return res.writeHead(404).end('Not found');
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`原型已启动：http://localhost:${port}`));
